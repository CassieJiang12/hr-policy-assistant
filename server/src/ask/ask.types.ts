export type AskStatus = 'answered' | 'needs_clarification' | 'not_found';

export type AskMode = 'mock' | 'real';

export type PolicySource = {
  id: string;
  document: string;
  text: string;
};

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
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
  usage?: TokenUsage | null;
};
