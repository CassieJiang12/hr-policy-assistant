import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppHttpException } from '../http/app-http.exception.js';
import type { PolicyRecord } from '../policies/load-policies.js';
import type { RetrievalResult } from '../retrieval/retrieve.js';
import { runAskFlow } from './ask-flow.js';
import type { StructuredAskResult } from './openai-ask.js';
import { NO_MATCH_ANSWER } from './policy-prompt.js';

const pto: PolicyRecord = {
  id: 'PTO-01',
  document: 'Leave Policy',
  text: 'US full-time employees receive 15 paid vacation days per calendar year.',
};
const remote: PolicyRecord = {
  id: 'REM-01',
  document: 'Remote Work Policy',
  text: 'US full-time employees may work remotely up to 2 days per week with manager approval.',
};

function retrieved(records: PolicyRecord[]): RetrievalResult {
  return {
    hits: records.map((record, index) => ({ record, score: 1 - index * 0.1 })),
    telemetry: {
      retrieval_ids: records.map((record) => record.id),
      retrieval_scores: records.map((_, index) => 1 - index * 0.1),
      retrieval_latency_ms: 4,
      embedding_usage: { prompt_tokens: 3, total_tokens: 3 },
    },
  };
}

describe('runAskFlow', () => {
  it('sends only retrieved records to generation and copies their server text', async () => {
    let instructions = '';
    const result = await runAskFlow({
      mode: 'real',
      question: 'How many vacation days?',
      requestId: 'flow-1',
      started: Date.now(),
      retrieve: async () => retrieved([pto]),
      generate: async (input) => {
        instructions = input.instructions;
        return {
          output: {
            status: 'needs_clarification',
            answer: 'Are you a US full-time employee?',
            evidence_ids: [],
          },
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        } satisfies StructuredAskResult;
      },
    });

    assert.match(instructions, /ID: PTO-01/);
    assert.doesNotMatch(instructions, /ID: REM-01/);
    assert.match(instructions, /do not claim that every company policy was searched/i);
    assert.equal(result.body.status, 'needs_clarification');
    assert.deepEqual(result.body.sources, []);
    assert.equal(result.body.prompt_version, 'rag-v1');
  });

  it('rejects a policy id that was not in the retrieved set', async () => {
    await assert.rejects(
      () =>
        runAskFlow({
          mode: 'real',
          question: 'How many vacation days?',
          requestId: 'flow-2',
          started: Date.now(),
          retrieve: async () => retrieved([pto]),
          generate: async () => ({
            output: {
              status: 'answered',
              answer: 'Two remote days.',
              evidence_ids: ['REM-01'],
            },
            usage: null,
          }),
        }),
      (error: unknown) =>
        error instanceof AppHttpException &&
        (error.getResponse() as { error: { code: string; message: string } }).error.code ===
          'MODEL_OUTPUT_INVALID' &&
        (error.getResponse() as { error: { message: string } }).error.message.includes('REM-01'),
    );
  });

  it('returns not_found without generation when retrieval has no matches', async () => {
    let generated = 0;
    const result = await runAskFlow({
      mode: 'real',
      question: 'unused vacation payout',
      requestId: 'flow-3',
      started: Date.now(),
      retrieve: async () => retrieved([]),
      generate: async () => {
        generated += 1;
        throw new Error('generation should not run');
      },
    });
    assert.equal(generated, 0);
    assert.equal(result.body.status, 'not_found');
    assert.equal(result.body.answer, NO_MATCH_ANSWER);
    assert.deepEqual(result.body.sources, []);
    assert.equal(result.generation_usage, null);
  });

  it('leaves embedding failures as technical errors', async () => {
    let generated = 0;
    await assert.rejects(
      () =>
        runAskFlow({
          mode: 'real',
          question: 'vacation',
          requestId: 'flow-4',
          started: Date.now(),
          retrieve: async () => {
            throw new AppHttpException(504, 'UPSTREAM_TIMEOUT', 'The embedding request timed out.', 'flow-4');
          },
          generate: async () => {
            generated += 1;
            throw new Error('generation should not run');
          },
        }),
      (error: unknown) =>
        error instanceof AppHttpException &&
        (error.getResponse() as { error: { code: string } }).error.code === 'UPSTREAM_TIMEOUT',
    );
    assert.equal(generated, 0);
  });

  it('keeps mock mode independent of retrieval', async () => {
    let called = 0;
    const result = await runAskFlow({
      mode: 'mock',
      question: 'Does DemoCo match my 401(k) contributions?',
      requestId: 'flow-5',
      started: Date.now(),
      retrieve: async () => {
        called += 1;
        throw new Error('mock must not retrieve');
      },
      generate: async () => {
        called += 1;
        throw new Error('mock must not generate');
      },
    });
    assert.equal(called, 0);
    assert.equal(result.body.mode, 'mock');
    assert.equal(result.body.fixture, 'mock-fixture');
    assert.equal(result.body.status, 'not_found');
    assert.equal(result.retrieval, null);
    assert.match(result.body.answer, /\[MOCK\]/);
  });

  it('builds source cards from the retrieved record, not model text', async () => {
    const result = await runAskFlow({
      mode: 'real',
      question: 'remote days',
      requestId: 'flow-6',
      started: Date.now(),
      retrieve: async () => retrieved([remote]),
      generate: async () => ({
        output: {
          status: 'answered',
          answer: 'Up to 2 days with manager approval.',
          evidence_ids: [remote.id],
        },
        usage: null,
      }),
    });
    assert.equal(result.body.sources[0]?.text, remote.text);
    assert.equal(result.body.sources[0]?.document, remote.document);
  });
});
