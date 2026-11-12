import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PolicyRecord } from '../policies/load-policies.js';
import { embeddingInput, hashPolicyContent } from './policy-hash.js';
import { INDEX_FORMAT_VERSION, type PolicyIndex, type TextEmbedder } from './index-types.js';

export async function buildPolicyIndex(options: {
  policies: PolicyRecord[];
  embeddingModel: string;
  embed: TextEmbedder;
  outputPath: string;
}): Promise<PolicyIndex> {
  const vectors = await options.embed({
    texts: options.policies.map((policy) => embeddingInput(policy)),
  });
  if (vectors.vectors.length !== options.policies.length) {
    throw new Error('Embedding response did not include one vector per policy.');
  }
  const dimensions = vectors.vectors[0]?.length ?? 0;
  if (dimensions < 1) {
    throw new Error('Embedding vectors were empty.');
  }
  for (const vector of vectors.vectors) {
    assertVector(vector, dimensions);
  }

  const index: PolicyIndex = {
    index_version: INDEX_FORMAT_VERSION,
    embedding_model: options.embeddingModel,
    dimensions,
    source_hash: hashPolicyContent(options.policies),
    records: options.policies.map((policy, index) => ({
      id: policy.id,
      vector: vectors.vectors[index] ?? [],
    })),
  };
  writeIndexAtomically(options.outputPath, index);
  return index;
}

function assertVector(vector: number[], dimensions: number): void {
  if (vector.length !== dimensions || vector.some((value) => !Number.isFinite(value))) {
    throw new Error('Embedding response contained an invalid vector.');
  }
}

export function writeIndexAtomically(path: string, index: PolicyIndex): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(index)}\n`);
  renameSync(temporary, path);
}
