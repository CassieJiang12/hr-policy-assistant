export type AskStatus = 'answered' | 'needs_clarification' | 'not_found';

export type AskMode = 'mock' | 'real';

export type PolicySource = {
  id: string;
  document: string;
  text: string;
};

export type HealthResponse = {
  status: string;
  mode: AskMode;
  real_configured: boolean;
};

export type AskSuccessResponse = {
  status: AskStatus;
  answer: string;
  sources: PolicySource[];
  request_id: string;
  latency_ms: number;
  mode: AskMode;
  fixture?: string;
  prompt_version?: string;
};

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    message: string,
    statusCode: number,
    code?: string,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.requestId = requestId;
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  if (!response.ok) {
    throw new Error('Health check failed');
  }
  return (await response.json()) as HealthResponse;
}

export async function askQuestion(question: string): Promise<AskSuccessResponse> {
  const response = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });

  if (!response.ok) {
    const parsed = await readErrorPayload(response);
    throw new ApiError(
      parsed.message,
      response.status,
      parsed.code,
      parsed.requestId,
    );
  }

  return (await response.json()) as AskSuccessResponse;
}

async function readErrorPayload(response: Response): Promise<{
  message: string;
  code?: string;
  requestId?: string;
}> {
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === 'object') {
      const record = payload as {
        message?: unknown;
        request_id?: unknown;
        error?: { code?: unknown; message?: unknown };
      };
      const nestedMessage =
        typeof record.error?.message === 'string' ? record.error.message : undefined;
      const nestedCode =
        typeof record.error?.code === 'string' ? record.error.code : undefined;
      const topMessage = typeof record.message === 'string' ? record.message : undefined;
      const requestId =
        typeof record.request_id === 'string' ? record.request_id : undefined;
      const message = nestedMessage ?? topMessage;
      if (message) {
        return { message, code: nestedCode, requestId };
      }
    }
  } catch {
    // Fall through to status text.
  }

  return {
    message: `Request failed (${response.status} ${response.statusText})`,
  };
}
