import { isAbsolute, join } from 'node:path';

export type AskMode = 'mock' | 'real';

export type OpenAiSettings = {
  apiKey: string;
  model: string;
};

export const DEFAULT_OPENAI_TIMEOUT_MS = 15_000;
export const DEFAULT_OPENAI_MAX_RETRIES = 1;
export const DEFAULT_ASK_DEADLINE_MS = 35_000;
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
export const DEFAULT_RETRIEVAL_TOP_K = 3;
export const DEFAULT_POLICY_INDEX_PATH = 'data/policy-index.json';

export type TimeoutSettings = {
  timeoutMs: number;
  maxRetries: number;
  deadlineMs: number;
};

export function getAskMode(): AskMode {
  const raw = (process.env.ASK_MODE ?? 'real').trim().toLowerCase();
  return raw === 'mock' ? 'mock' : 'real';
}

export function readOpenAiSettings(): OpenAiSettings {
  return {
    apiKey: process.env.OPENAI_API_KEY?.trim() ?? '',
    model: process.env.OPENAI_MODEL?.trim() ?? '',
  };
}

export function hasRealApiConfig(): boolean {
  const { apiKey, model } = readOpenAiSettings();
  return apiKey.length > 0 && model.length > 0;
}

export type RetrievalSettings = {
  embeddingModel: string;
  indexPath: string;
  topK: number;
  minScore?: number;
  dimensions?: number;
};

export function getRetrievalSettings(): RetrievalSettings {
  return {
    embeddingModel:
      process.env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL,
    indexPath: resolveIndexPath(),
    topK: readIntEnv('RETRIEVAL_TOP_K', DEFAULT_RETRIEVAL_TOP_K, 1),
    minScore: readOptionalUnitScore('RETRIEVAL_MIN_SCORE'),
    dimensions: readOptionalInt('EMBEDDING_DIMENSIONS'),
  };
}

export function resolveIndexPath(): string {
  const override = process.env.POLICY_INDEX_PATH?.trim();
  if (!override) {
    return join(process.cwd(), DEFAULT_POLICY_INDEX_PATH);
  }
  return isAbsolute(override) ? override : join(process.cwd(), override);
}

export function getTimeoutSettings(): TimeoutSettings {
  return {
    timeoutMs: readIntEnv('OPENAI_TIMEOUT_MS', DEFAULT_OPENAI_TIMEOUT_MS, 1),
    maxRetries: readIntEnv('OPENAI_MAX_RETRIES', DEFAULT_OPENAI_MAX_RETRIES, 0),
    deadlineMs: readIntEnv('ASK_DEADLINE_MS', DEFAULT_ASK_DEADLINE_MS, 1),
  };
}

function readOptionalInt(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return undefined;
  }
  return Math.floor(parsed);
}

function readOptionalUnitScore(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

function readIntEnv(name: string, fallback: number, min: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return Math.floor(parsed);
}
