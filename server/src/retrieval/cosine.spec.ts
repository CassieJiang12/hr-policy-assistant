import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cosineSimilarity, rankByCosine } from './cosine.js';

describe('cosine similarity', () => {
  it('ranks by score and breaks ties by id', () => {
    const ranked = rankByCosine(
      [1, 1],
      [
        { id: 'REM-01', vector: [0, 1] },
        { id: 'PTO-01', vector: [1, 0] },
        { id: 'EXP-01', vector: [1, 1] },
      ],
      2,
    );
    assert.deepEqual(
      ranked.map((item) => item.id),
      ['EXP-01', 'PTO-01'],
    );
    assert.ok((ranked[1]?.score ?? 0) > 0.7);
    assert.ok(Math.abs((ranked[1]?.score ?? 0) - cosineSimilarity([1, 1], [1, 0])) < 1e-12);
  });

  it('applies top-K after an optional minimum score', () => {
    const ranked = rankByCosine(
      [1, 0],
      [
        { id: 'PTO-01', vector: [1, 0] },
        { id: 'REM-01', vector: [0, 1] },
      ],
      3,
      0.5,
    );
    assert.deepEqual(
      ranked.map((item) => item.id),
      ['PTO-01'],
    );
  });

  it('rejects vectors with different lengths', () => {
    assert.throws(() => cosineSimilarity([1], [1, 0]), /same length/);
  });
});
