import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scoreCase } from './score-case.js';

const knownIds = new Set(['PTO-01', 'PTO-02', 'REM-01']);

describe('scoreCase', () => {
  it('passes status and exact expected evidence', () => {
    const result = scoreCase({
      expectedStatus: 'answered',
      expectedEvidenceIds: ['PTO-01'],
      actualStatus: 'answered',
      actualSourceIds: ['PTO-01'],
      knownIds,
    });
    assert.equal(result.status_pass, true);
    assert.equal(result.evidence_pass, 'yes');
    assert.equal(result.content_pass, '');
  });

  it('does not treat any legal citation as enough', () => {
    const result = scoreCase({
      expectedStatus: 'answered',
      expectedEvidenceIds: ['PTO-01'],
      actualStatus: 'answered',
      actualSourceIds: ['REM-01'],
      knownIds,
    });
    assert.equal(result.evidence_pass, 'no');
    assert.deepEqual(result.missing_ids, ['PTO-01']);
  });

  it('flags extra known citations for relevance review', () => {
    const result = scoreCase({
      expectedStatus: 'answered',
      expectedEvidenceIds: ['PTO-01'],
      actualStatus: 'answered',
      actualSourceIds: ['PTO-01', 'PTO-02'],
      knownIds,
    });
    assert.equal(result.evidence_pass, 'review');
    assert.deepEqual(result.extra_ids, ['PTO-02']);
  });

  it('fails unknown citations', () => {
    const result = scoreCase({
      expectedStatus: 'answered',
      expectedEvidenceIds: ['PTO-01'],
      actualStatus: 'answered',
      actualSourceIds: ['PTO-01', 'FAKE-1'],
      knownIds,
    });
    assert.equal(result.evidence_pass, 'no');
    assert.deepEqual(result.unknown_ids, ['FAKE-1']);
  });

  it('fails not_found answers that still cite sources', () => {
    const result = scoreCase({
      expectedStatus: 'not_found',
      expectedEvidenceIds: [],
      actualStatus: 'not_found',
      actualSourceIds: ['PTO-01'],
      knownIds,
    });
    assert.equal(result.evidence_pass, 'no');
  });

  it('never auto-fills content_pass from keywords or citations', () => {
    const result = scoreCase({
      expectedStatus: 'answered',
      expectedEvidenceIds: ['PTO-01'],
      actualStatus: 'answered',
      actualSourceIds: ['PTO-01'],
      knownIds,
    });
    assert.equal(result.content_pass, '');
  });
});
