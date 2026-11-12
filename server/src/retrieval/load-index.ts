import { readFileSync } from 'node:fs';
import type { RetrievalSettings } from '../config/app-config.js';
import type { PolicyRecord } from '../policies/load-policies.js';
import { hashPolicyContent } from './policy-hash.js';
import { INDEX_FORMAT_VERSION, type PolicyIndex } from './index-types.js';

export class IndexValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IndexValidationError';
  }
}

let cached: { path: string; index: PolicyIndex } | undefined;

export function clearPolicyIndexCache(): void {
  cached = undefined;
}

export function loadPolicyIndex(
  policies: PolicyRecord[],
  settings: RetrievalSettings,
): PolicyIndex {
  if (cached?.path === settings.indexPath) {
    assertIndexCompatible(cached.index, policies, settings);
    return cached.index;
  }

  let raw: string;
  try {
    raw = readFileSync(settings.indexPath, 'utf8');
  } catch {
    throw indexError(
      'INDEX_MISSING',
      `Policy index was not found at ${settings.indexPath}. From server/, run npm run index:policies, then restart the API. A question does not build the index.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw indexError(
      'INDEX_INVALID',
      `Policy index at ${settings.indexPath} is not valid JSON. Rebuild it with npm run index:policies and restart the API.`,
    );
  }

  const index = validateIndexShape(parsed);
  assertIndexCompatible(index, policies, settings);
  cached = { path: settings.indexPath, index };
  return index;
}

export function validateIndexShape(value: unknown): PolicyIndex {
  if (!value || typeof value !== 'object') {
    throw indexError('INDEX_INVALID', 'Policy index must be a JSON object.');
  }
  const record = value as Partial<PolicyIndex>;
  if (record.index_version !== INDEX_FORMAT_VERSION) {
    throw indexError(
      'INDEX_INCOMPATIBLE',
      'Policy index version is not supported. Rebuild it with npm run index:policies and restart the API.',
    );
  }
  if (typeof record.embedding_model !== 'string' || record.embedding_model.length === 0) {
    throw indexError('INDEX_INVALID', 'Policy index is missing embedding_model.');
  }
  if (typeof record.source_hash !== 'string' || record.source_hash.length === 0) {
    throw indexError('INDEX_INVALID', 'Policy index is missing source_hash.');
  }
  const dimensions = record.dimensions;
  if (typeof dimensions !== 'number' || !Number.isInteger(dimensions) || dimensions < 1) {
    throw indexError('INDEX_INVALID', 'Policy index dimensions are invalid.');
  }
  if (!Array.isArray(record.records) || record.records.length === 0) {
    throw indexError('INDEX_INVALID', 'Policy index has no records.');
  }

  const seen = new Set<string>();
  const records = record.records.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw indexError('INDEX_INVALID', `Index record ${index} is invalid.`);
    }
    const id = (entry as { id?: unknown }).id;
    const vector = (entry as { vector?: unknown }).vector;
    if (typeof id !== 'string' || id.length === 0) {
      throw indexError('INDEX_INVALID', `Index record ${index} is missing an id.`);
    }
    if (seen.has(id)) {
      throw indexError('INDEX_INVALID', `Duplicate index id: ${id}.`);
    }
    seen.add(id);
    if (!Array.isArray(vector) || vector.length !== dimensions) {
      throw indexError('INDEX_INVALID', `Index record ${id} has an inconsistent vector length.`);
    }
    if (vector.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      throw indexError('INDEX_INVALID', `Index record ${id} has a non-finite vector value.`);
    }
    return { id, vector };
  });

  return {
    index_version: INDEX_FORMAT_VERSION,
    embedding_model: record.embedding_model,
    dimensions,
    source_hash: record.source_hash,
    records,
  };
}

export function assertIndexCompatible(
  index: PolicyIndex,
  policies: PolicyRecord[],
  settings: RetrievalSettings,
): void {
  if (index.source_hash !== hashPolicyContent(policies)) {
    throw indexError(
      'INDEX_STALE',
      'Policy index does not match policies.json. Run npm run index:policies, then restart the API.',
    );
  }
  const policyIds = new Set(policies.map((policy) => policy.id));
  const indexIds = new Set(index.records.map((record) => record.id));
  if (policyIds.size !== indexIds.size || [...policyIds].some((id) => !indexIds.has(id))) {
    throw indexError(
      'INDEX_STALE',
      'Policy index does not contain the current policy ids. Run npm run index:policies, then restart the API.',
    );
  }
  if (index.embedding_model !== settings.embeddingModel) {
    throw indexError(
      'INDEX_INCOMPATIBLE',
      `Policy index was built with ${index.embedding_model}, but EMBEDDING_MODEL is ${settings.embeddingModel}. Rebuild the index and restart the API.`,
    );
  }
  if (settings.dimensions !== undefined && index.dimensions !== settings.dimensions) {
    throw indexError(
      'INDEX_INCOMPATIBLE',
      `Policy index has ${index.dimensions} dimensions, but EMBEDDING_DIMENSIONS is ${settings.dimensions}. Rebuild the index and restart the API.`,
    );
  }
}

function indexError(code: string, message: string): IndexValidationError {
  return new IndexValidationError(code, message);
}
