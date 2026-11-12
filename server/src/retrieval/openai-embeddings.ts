import OpenAI from 'openai';
import type { TimeoutSettings } from '../config/app-config.js';
import { mapOpenAiFailure } from '../ask/openai-ask.js';
import type { EmbeddingUsage, TextEmbedder } from './index-types.js';

export function createOpenAiEmbedder(options: {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  dimensions?: number;
  requestId: string;
}): TextEmbedder {
  const client = new OpenAI({
    apiKey: options.apiKey,
    timeout: options.timeoutMs,
    maxRetries: options.maxRetries,
    logLevel: 'off',
  });

  return async ({ texts, signal }) => {
    try {
      const response = await client.embeddings.create(
        {
          model: options.model,
          input: texts,
          ...(options.dimensions ? { dimensions: options.dimensions } : {}),
        },
        { signal },
      );
      const ordered = [...response.data].sort((left, right) => left.index - right.index);
      return {
        vectors: ordered.map((item) => item.embedding),
        usage: readUsage(response.usage),
      };
    } catch (error) {
      throw mapOpenAiFailure(error, options.requestId);
    }
  };
}

export function createRequestEmbedder(options: {
  apiKey: string;
  retrievalModel: string;
  dimensions?: number;
  timeouts: TimeoutSettings;
  requestId: string;
}): TextEmbedder {
  return createOpenAiEmbedder({
    apiKey: options.apiKey,
    model: options.retrievalModel,
    timeoutMs: options.timeouts.timeoutMs,
    maxRetries: options.timeouts.maxRetries,
    dimensions: options.dimensions,
    requestId: options.requestId,
  });
}

function readUsage(usage: { prompt_tokens: number; total_tokens: number } | undefined): EmbeddingUsage | null {
  if (!usage) {
    return null;
  }
  return {
    prompt_tokens: usage.prompt_tokens,
    total_tokens: usage.total_tokens,
  };
}
