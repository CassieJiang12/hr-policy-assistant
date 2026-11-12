import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ModelOutputValidationError,
  validateModelOutput,
} from './validate-model-output.js';

const policies = [
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

describe('validateModelOutput', () => {
  it('maps known evidence IDs to server-owned source text', () => {
    const result = validateModelOutput(
      {
        status: 'answered',
        answer: 'Up to 2 remote days with manager approval.',
        evidence_ids: ['REM-01', 'REM-01'],
      },
      policies,
    );
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0]?.text, policies[1]?.text);
  });

  it('rejects unknown evidence IDs', () => {
    assert.throws(
      () =>
        validateModelOutput(
          {
            status: 'answered',
            answer: 'Something.',
            evidence_ids: ['FAKE-99'],
          },
          policies,
        ),
      (error: unknown) =>
        error instanceof ModelOutputValidationError &&
        error.message.includes('FAKE-99'),
    );
  });

  it('rejects answered with no evidence', () => {
    assert.throws(
      () =>
        validateModelOutput(
          { status: 'answered', answer: '15 days.', evidence_ids: [] },
          policies,
        ),
      ModelOutputValidationError,
    );
  });

  it('rejects not_found with citations', () => {
    assert.throws(
      () =>
        validateModelOutput(
          {
            status: 'not_found',
            answer: 'Not in the records.',
            evidence_ids: ['PTO-01'],
          },
          policies,
        ),
      (error: unknown) =>
        error instanceof ModelOutputValidationError &&
        error.message.includes('not_found'),
    );
  });

  it('rejects needs_clarification with citations', () => {
    assert.throws(
      () =>
        validateModelOutput(
          {
            status: 'needs_clarification',
            answer: 'Are you US full-time?',
            evidence_ids: ['PTO-01'],
          },
          policies,
        ),
      ModelOutputValidationError,
    );
  });
});
