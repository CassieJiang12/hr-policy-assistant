export const INDEX_FORMAT_VERSION = 1;

export type IndexRecord = {
  id: string;
  vector: number[];
};

export type PolicyIndex = {
  index_version: number;
  embedding_model: string;
  dimensions: number;
  source_hash: string;
  records: IndexRecord[];
};

export type EmbeddingUsage = {
  prompt_tokens: number;
  total_tokens: number;
};

export type TextEmbedder = (input: {
  texts: string[];
  signal?: AbortSignal;
}) => Promise<{ vectors: number[][]; usage: EmbeddingUsage | null }>;
