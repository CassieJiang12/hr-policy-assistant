export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) {
    throw new Error('Vectors must be non-empty and the same length.');
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export type ScoredId = {
  id: string;
  score: number;
};

export function rankByCosine(
  query: number[],
  entries: { id: string; vector: number[] }[],
  topK: number,
  minScore?: number,
): ScoredId[] {
  const ranked = entries
    .map((entry) => ({
      id: entry.id,
      score: cosineSimilarity(query, entry.vector),
    }))
    .filter((entry) => minScore === undefined || entry.score >= minScore)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return ranked.slice(0, topK);
}
