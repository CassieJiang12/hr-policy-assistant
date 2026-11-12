import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import type { RetrievalSettings } from '../config/app-config.js';
import { AppHttpException } from '../http/app-http.exception.js';
import type { PolicyRecord } from '../policies/load-policies.js';
import { PolicyDataError, validatePolicyRecords } from '../policies/validate-policy-records.js';
import { buildPolicyIndex } from './build-policy-index.js';
import type { TextEmbedder } from './index-types.js';
import { clearPolicyIndexCache, IndexValidationError, loadPolicyIndex } from './load-index.js';
import { retrievePolicies } from './retrieve.js';

const policies: PolicyRecord[] = [
  {
    id: 'PTO-01',
    document: 'Leave Policy',
    text: 'US full-time employees receive 15 paid vacation days per calendar year.',
  },
  {
    id: 'REM-01',
    document: 'Remote Work Policy',
    text: 'US full-time employees may work remotely up to 2 days per week with manager approval.',
  },
];

const directory = mkdtempSync(join(tmpdir(), 'policy-index-'));
after(() => {
  rmSync(directory, { recursive: true, force: true });
});

const embed: TextEmbedder = async ({ texts }) => ({
  vectors: texts.map((text) => {
    if (text.startsWith('Leave')) {
      return [1, 0];
    }
    if (text.startsWith('Remote')) {
      return [0, 1];
    }
    if (text === 'vacation') {
      return [1, 0];
    }
    if (text === 'tie') {
      return [1, 1];
    }
    if (text === 'short') {
      return [1];
    }
    return [0, 0];
  }),
  usage: { prompt_tokens: texts.length, total_tokens: texts.length },
});

function settings(indexPath: string, overrides: Partial<RetrievalSettings> = {}): RetrievalSettings {
  return {
    embeddingModel: 'text-embedding-3-small',
    indexPath,
    topK: 3,
    ...overrides,
  };
}

describe('policy index', () => {
  it('rejects duplicate policy ids and missing fields before embedding', () => {
    assert.throws(
      () => validatePolicyRecords([policies[0], policies[0]]),
      (error: unknown) => error instanceof PolicyDataError && /Duplicate/.test(error.message),
    );
    assert.throws(
      () => validatePolicyRecords([{ id: 'PTO-01', document: 'Leave Policy' }]),
      PolicyDataError,
    );
  });

  it('writes a versioned index and ranks with deterministic ties', async () => {
    clearPolicyIndexCache();
    const indexPath = join(directory, 'rank.json');
    const index = await buildPolicyIndex({
      policies,
      embeddingModel: 'text-embedding-3-small',
      embed,
      outputPath: indexPath,
    });
    assert.equal(index.index_version, 1);
    assert.equal(index.dimensions, 2);
    assert.equal(index.records[0]?.id, 'PTO-01');

    const ranked = await retrievePolicies('vacation', {
      policies,
      settings: settings(indexPath, { topK: 1 }),
      embed,
      requestId: 'rank',
    });
    assert.deepEqual(ranked.telemetry.retrieval_ids, ['PTO-01']);
    assert.equal(ranked.hits[0]?.record.text, policies[0]?.text);

    clearPolicyIndexCache();
    const tied = await retrievePolicies('tie', {
      policies,
      settings: settings(indexPath, { topK: 1 }),
      embed,
      requestId: 'tie',
    });
    assert.deepEqual(tied.telemetry.retrieval_ids, ['PTO-01']);
  });

  it('returns no hits when every score is below the configured minimum', async () => {
    clearPolicyIndexCache();
    const indexPath = join(directory, 'min-score.json');
    await buildPolicyIndex({
      policies,
      embeddingModel: 'text-embedding-3-small',
      embed,
      outputPath: indexPath,
    });
    const result = await retrievePolicies('tie', {
      policies,
      settings: settings(indexPath, { minScore: 0.99 }),
      embed,
      requestId: 'zero',
    });
    assert.deepEqual(result.hits, []);
  });

  it('rejects a missing, stale, or incompatible index', async () => {
    clearPolicyIndexCache();
    const missing = join(directory, 'missing.json');
    await assert.rejects(
      () =>
        retrievePolicies('vacation', {
          policies,
          settings: settings(missing),
          embed,
          requestId: 'missing',
        }),
      (error: unknown) =>
        error instanceof AppHttpException &&
        (error.getResponse() as { error: { code: string } }).error.code === 'INDEX_MISSING',
    );

    const indexPath = join(directory, 'stale.json');
    await buildPolicyIndex({
      policies,
      embeddingModel: 'text-embedding-3-small',
      embed,
      outputPath: indexPath,
    });
    clearPolicyIndexCache();
    assert.throws(
      () =>
        loadPolicyIndex(
          [{ ...policies[0]!, text: 'Changed allowance.' }, policies[1]!],
          settings(indexPath),
        ),
      (error: unknown) => error instanceof IndexValidationError && error.code === 'INDEX_STALE',
    );

    clearPolicyIndexCache();
    assert.throws(
      () => loadPolicyIndex(policies, settings(indexPath, { embeddingModel: 'other-model' })),
      (error: unknown) =>
        error instanceof IndexValidationError && error.code === 'INDEX_INCOMPATIBLE',
    );

    clearPolicyIndexCache();
    assert.throws(
      () => loadPolicyIndex(policies, settings(indexPath, { dimensions: 8 })),
      (error: unknown) =>
        error instanceof IndexValidationError && error.code === 'INDEX_INCOMPATIBLE',
    );
  });

  it('rejects invalid vectors, duplicate index ids, and a mismatched question vector', async () => {
    clearPolicyIndexCache();
    const invalidPath = join(directory, 'invalid.json');
    writeFileSync(
      invalidPath,
      JSON.stringify({
        index_version: 1,
        embedding_model: 'text-embedding-3-small',
        dimensions: 2,
        source_hash: 'abc',
        records: [
          { id: 'PTO-01', vector: [1, null] },
          { id: 'PTO-01', vector: [1, 0] },
        ],
      }),
    );
    assert.throws(
      () => loadPolicyIndex(policies, settings(invalidPath)),
      (error: unknown) => error instanceof IndexValidationError && error.code === 'INDEX_INVALID',
    );

    clearPolicyIndexCache();
    const duplicatePath = join(directory, 'duplicate.json');
    writeFileSync(
      duplicatePath,
      JSON.stringify({
        index_version: 1,
        embedding_model: 'text-embedding-3-small',
        dimensions: 2,
        source_hash: 'abc',
        records: [
          { id: 'PTO-01', vector: [1, 0] },
          { id: 'PTO-01', vector: [0, 1] },
        ],
      }),
    );
    assert.throws(
      () => loadPolicyIndex(policies, settings(duplicatePath)),
      (error: unknown) =>
        error instanceof IndexValidationError &&
        error.code === 'INDEX_INVALID' &&
        /Duplicate/.test(error.message),
    );

    clearPolicyIndexCache();
    const indexPath = join(directory, 'dimension.json');
    await buildPolicyIndex({
      policies,
      embeddingModel: 'text-embedding-3-small',
      embed,
      outputPath: indexPath,
    });
    await assert.rejects(
      () =>
        retrievePolicies('short', {
          policies,
          settings: settings(indexPath),
          embed,
          requestId: 'short',
        }),
      (error: unknown) =>
        error instanceof AppHttpException &&
        (error.getResponse() as { error: { code: string } }).error.code === 'EMBEDDING_INVALID',
    );
  });

  it('keeps an embedding provider failure as a technical error', async () => {
    clearPolicyIndexCache();
    const indexPath = join(directory, 'embed-fail.json');
    await buildPolicyIndex({
      policies,
      embeddingModel: 'text-embedding-3-small',
      embed,
      outputPath: indexPath,
    });
    await assert.rejects(
      () =>
        retrievePolicies('vacation', {
          policies,
          settings: settings(indexPath),
          embed: async () => {
            throw new AppHttpException(504, 'UPSTREAM_TIMEOUT', 'The embedding request timed out.', 'embed');
          },
          requestId: 'embed',
        }),
      (error: unknown) =>
        error instanceof AppHttpException &&
        (error.getResponse() as { error: { code: string } }).error.code === 'UPSTREAM_TIMEOUT',
    );
  });
});
