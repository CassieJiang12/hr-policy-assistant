import { HttpStatus } from '@nestjs/common';
import { AppHttpException } from '../http/app-http.exception.js';
import type { RetrievalResult } from '../retrieval/retrieve.js';
import type { AskSuccessResponse } from './ask.types.js';
import { MOCK_ASK_FIXTURE_NAME, selectMockAskFixture } from './mock-ask.fixture.js';
import type { StructuredAskResult } from './openai-ask.js';
import { buildPolicyInstructions, NO_MATCH_ANSWER, PROMPT_VERSION } from './policy-prompt.js';
import {
  ModelOutputValidationError,
  validateModelOutput,
} from './validate-model-output.js';

export type AskFlowResult = {
  body: AskSuccessResponse;
  retrieval: RetrievalResult['telemetry'] | null;
  generation_usage: StructuredAskResult['usage'];
};

export async function runAskFlow(options: {
  mode: 'mock' | 'real';
  question: string;
  requestId: string;
  started: number;
  signal?: AbortSignal;
  onRetrieval?: (telemetry: RetrievalResult['telemetry']) => void;
  retrieve?: (question: string, signal?: AbortSignal) => Promise<RetrievalResult>;
  generate?: (input: {
    instructions: string;
    question: string;
    signal?: AbortSignal;
  }) => Promise<StructuredAskResult>;
}): Promise<AskFlowResult> {
  if (options.mode === 'mock') {
    const fixture = selectMockAskFixture(options.question);
    return {
      body: {
        status: fixture.status,
        answer: fixture.answer,
        sources: fixture.sources,
        request_id: options.requestId,
        latency_ms: Date.now() - options.started,
        mode: 'mock',
        fixture: MOCK_ASK_FIXTURE_NAME,
        usage: null,
      },
      retrieval: null,
      generation_usage: null,
    };
  }

  if (!options.retrieve || !options.generate) {
    throw new AppHttpException(
      HttpStatus.SERVICE_UNAVAILABLE,
      'MISSING_CONFIGURATION',
      'Real API mode is not configured.',
      options.requestId,
    );
  }

  const retrieved = await options.retrieve(options.question, options.signal);
  options.onRetrieval?.(retrieved.telemetry);
  if (retrieved.hits.length === 0) {
    return {
      body: {
        status: 'not_found',
        answer: NO_MATCH_ANSWER,
        sources: [],
        request_id: options.requestId,
        latency_ms: Date.now() - options.started,
        mode: 'real',
        prompt_version: PROMPT_VERSION,
        usage: null,
      },
      retrieval: retrieved.telemetry,
      generation_usage: null,
    };
  }

  const policies = retrieved.hits.map((hit) => hit.record);
  const generated = await options.generate({
    instructions: buildPolicyInstructions(policies),
    question: options.question,
    signal: options.signal,
  });

  try {
    const validated = validateModelOutput(generated.output, policies);
    return {
      body: {
        status: validated.status,
        answer: validated.answer,
        sources: validated.sources,
        request_id: options.requestId,
        latency_ms: Date.now() - options.started,
        mode: 'real',
        prompt_version: PROMPT_VERSION,
        usage: generated.usage,
      },
      retrieval: retrieved.telemetry,
      generation_usage: generated.usage,
    };
  } catch (error) {
    if (error instanceof ModelOutputValidationError) {
      throw new AppHttpException(
        HttpStatus.BAD_GATEWAY,
        error.code,
        error.message,
        options.requestId,
      );
    }
    throw error;
  }
}
