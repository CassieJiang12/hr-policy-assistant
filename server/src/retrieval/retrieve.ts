import { HttpStatus } from '@nestjs/common';
import {
  getRetrievalSettings,
  readOpenAiSettings,
  type RetrievalSettings,
  type TimeoutSettings,
} from '../config/app-config.js';
import { AppHttpException } from '../http/app-http.exception.js';
import { loadPolicies, type PolicyRecord } from '../policies/load-policies.js';
import { rankByCosine } from './cosine.js';
import type { EmbeddingUsage, TextEmbedder } from './index-types.js';
import { IndexValidationError, loadPolicyIndex } from './load-index.js';
import { createRequestEmbedder } from './openai-embeddings.js';

export type RetrievalHit = {
  record: PolicyRecord;
  score: number;
};

export type RetrievalTelemetry = {
  retrieval_ids: string[];
  retrieval_scores: number[];
  retrieval_latency_ms: number;
  embedding_usage: EmbeddingUsage | null;
};

export type RetrievalResult = {
  hits: RetrievalHit[];
  telemetry: RetrievalTelemetry;
};

export async function retrievePolicies(
  question: string,
  options: {
    signal?: AbortSignal;
    embed?: TextEmbedder;
    policies?: PolicyRecord[];
    settings?: RetrievalSettings;
    timeouts?: TimeoutSettings;
    requestId?: string;
  } = {},
): Promise<RetrievalResult> {
  const started = Date.now();
  const policies = options.policies ?? loadPolicies();
  const settings = options.settings ?? getRetrievalSettings();
  const requestId = options.requestId ?? 'retrieval';
  let index;
  try {
    index = loadPolicyIndex(policies, settings);
  } catch (error) {
    if (error instanceof IndexValidationError) {
      throw new AppHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        error.code,
        error.message,
        requestId,
      );
    }
    throw error;
  }
  const embed =
    options.embed ??
    createRequestEmbedder({
      apiKey: readOpenAiSettings().apiKey,
      retrievalModel: settings.embeddingModel,
      dimensions: settings.dimensions,
      timeouts: options.timeouts ?? {
        timeoutMs: 15_000,
        maxRetries: 1,
        deadlineMs: 35_000,
      },
      requestId: options.requestId ?? 'retrieval',
    });

  const embedded = await embed({
    texts: [question],
    signal: options.signal,
  });
  const query = embedded.vectors[0];
  if (!query || query.length !== index.dimensions) {
    throw new AppHttpException(
      HttpStatus.BAD_GATEWAY,
      'EMBEDDING_INVALID',
      'The question embedding did not match the policy index dimensions.',
      requestId,
    );
  }

  const byId = new Map(policies.map((policy) => [policy.id, policy]));
  const ranked = rankByCosine(
    query,
    index.records,
    settings.topK,
    settings.minScore,
  );
  const hits = ranked.map((item) => ({
    record: byId.get(item.id)!,
    score: item.score,
  }));

  return {
    hits,
    telemetry: {
      retrieval_ids: hits.map((hit) => hit.record.id),
      retrieval_scores: hits.map((hit) => hit.score),
      retrieval_latency_ms: Date.now() - started,
      embedding_usage: embedded.usage,
    },
  };
}

export function retrievedPolicies(result: RetrievalResult): PolicyRecord[] {
  return result.hits.map((hit) => hit.record);
}