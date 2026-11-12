export type AskMode = 'mock' | 'real';

export type OpenAiSettings = {
  apiKey: string;
  model: string;
};

export const DEFAULT_OPENAI_TIMEOUT_MS = 15_000;
export const DEFAULT_OPENAI_MAX_RETRIES = 1;
export const DEFAULT_ASK_DEADLINE_MS = 35_000;

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

export function getTimeoutSettings(): TimeoutSettings {
  return {
    timeoutMs: readIntEnv('OPENAI_TIMEOUT_MS', DEFAULT_OPENAI_TIMEOUT_MS, 1),
    maxRetries: readIntEnv('OPENAI_MAX_RETRIES', DEFAULT_OPENAI_MAX_RETRIES, 0),
    deadlineMs: readIntEnv('ASK_DEADLINE_MS', DEFAULT_ASK_DEADLINE_MS, 1),
  };
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
