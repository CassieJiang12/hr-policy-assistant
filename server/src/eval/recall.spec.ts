import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recallAtK } from './recall.js';

describe('recallAtK', () => {
  it('returns null when a case has no labeled relevant evidence', () => {
    assert.equal(recallAtK([], ['PTO-01']), null);
  });

  it('scores labeled ids that appear anywhere in the retrieved list', () => {
    assert.equal(recallAtK(['PTO-01', 'PTO-02'], ['PTO-02', 'EXP-01', 'PTO-01']), 1);
    assert.equal(recallAtK(['PTO-01', 'PTO-02'], ['PTO-01']), 0.5);
  });
});
