import OpenAI, {
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
} from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { OpenAiSettings, TimeoutSettings } from '../config/app-config.js';
import { AppHttpException } from '../http/app-http.exception.js';
import type { TokenUsage } from './ask.types.js';
import {
  MODEL_OUTPUT_SCHEMA_NAME,
  modelAskOutputSchema,
  type ModelAskOutput,
} from './model-schema.js';

type ParsedResponse = Awaited<ReturnType<OpenAI['responses']['parse']>>;

export type StructuredAskResult = {
  output: ModelAskOutput;
  usage: TokenUsage | null;
};

export async function requestStructuredAsk(options: {
  settings: OpenAiSettings;
  timeouts: TimeoutSettings;
  instructions: string;
  question: string;
  requestId: string;
}): Promise<StructuredAskResult> {
  const client = new OpenAI({
    apiKey: options.settings.apiKey,
    timeout: options.timeouts.timeoutMs,
    maxRetries: options.timeouts.maxRetries,
    logLevel: 'off',
  });

  const controller = new AbortController();
  const deadline = setTimeout(
    () => controller.abort(),
    options.timeouts.deadlineMs,
  );

  let response: ParsedResponse;
  try {
    response = await client.responses.parse(
      {
        model: options.settings.model,
        instructions: options.instructions,
        input: options.question,
        text: {
          format: zodTextFormat(modelAskOutputSchema, MODEL_OUTPUT_SCHEMA_NAME),
        },
      },
      { signal: controller.signal },
    );
  } catch (error) {
    throw mapOpenAiFailure(error, options.requestId);
  } finally {
    clearTimeout(deadline);
  }

  if (response.status === 'incomplete') {
    const reason = response.incomplete_details?.reason ?? 'unknown';
    throw new AppHttpException(
      502,
      'MODEL_INCOMPLETE',
      `The model response was incomplete (${reason}). You can retry.`,
      options.requestId,
    );
  }

  if (findRefusal(response)) {
    throw new AppHttpException(
      502,
      'MODEL_REFUSAL',
      'The model refused to produce a policy answer. You can retry.',
      options.requestId,
    );
  }

  if (response.output_parsed == null) {
    throw new AppHttpException(
      502,
      'MODEL_OUTPUT_MISSING',
      'The model did not return a parsed structured object. You can retry.',
      options.requestId,
    );
  }

  const parsed = modelAskOutputSchema.safeParse(response.output_parsed);
  if (!parsed.success) {
    throw new AppHttpException(
      502,
      'MODEL_OUTPUT_INVALID',
      'The model output did not match the required status/answer/evidence_ids shape. You can retry.',
      options.requestId,
    );
  }

  return {
    output: parsed.data,
    usage: readUsage(response),
  };
}

function readUsage(response: ParsedResponse): TokenUsage | null {
  const usage = response.usage;
  if (!usage) {
    return null;
  }
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    total_tokens: usage.total_tokens,
  };
}

function findRefusal(response: ParsedResponse): string | undefined {
  for (const item of response.output) {
    if (item.type !== 'message') {
      continue;
    }
    for (const part of item.content) {
      if (part.type === 'refusal') {
        return part.refusal;
      }
    }
  }
  return undefined;
}

export function mapOpenAiFailure(error: unknown, requestId: string): AppHttpException {
  if (error instanceof AppHttpException) {
    return error;
  }

  if (isAbortError(error)) {
    return new AppHttpException(
      504,
      'ASK_DEADLINE',
      'The server deadline for this model request was reached. You can retry.',
      requestId,
    );
  }

  if (error instanceof APIConnectionTimeoutError) {
    return new AppHttpException(
      504,
      'UPSTREAM_TIMEOUT',
      'The model request timed out. You can retry.',
      requestId,
    );
  }

  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return new AppHttpException(
      502,
      'UPSTREAM_AUTH',
      'The model API rejected the server credentials. Check OPENAI_API_KEY in server/.env.',
      requestId,
    );
  }

  if (error instanceof RateLimitError || (error instanceof APIError && error.status === 429)) {
    const quota = isQuotaError(error);
    return new AppHttpException(
      503,
      quota ? 'UPSTREAM_QUOTA' : 'UPSTREAM_RATE_LIMIT',
      quota
        ? 'The model API reported insufficient quota.'
        : 'The model API rate-limited this request. You can retry later.',
      requestId,
    );
  }

  if (error instanceof APIError && (error.status === 401 || error.status === 403)) {
    return new AppHttpException(
      502,
      'UPSTREAM_AUTH',
      'The model API rejected the server credentials. Check OPENAI_API_KEY in server/.env.',
      requestId,
    );
  }

  return new AppHttpException(
    502,
    'UPSTREAM_ERROR',
    'The model API request failed. You can retry.',
    requestId,
  );
}

function isAbortError(error: unknown): boolean {
  if (error instanceof APIUserAbortError) {
    return true;
  }
  return error instanceof Error && error.name === 'AbortError';
}

function isQuotaError(error: APIError): boolean {
  if (error.code === 'insufficient_quota') {
    return true;
  }
  const body = error.error;
  if (body && typeof body === 'object' && 'code' in body) {
    return (body as { code?: unknown }).code === 'insufficient_quota';
  }
  return false;
}
