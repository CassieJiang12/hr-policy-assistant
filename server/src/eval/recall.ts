export function recallAtK(
  expectedIds: string[],
  retrievedIds: string[],
): number | null {
  const expected = [...new Set(expectedIds)];
  if (expected.length === 0) {
    return null;
  }
  const retrieved = new Set(retrievedIds);
  const found = expected.filter((id) => retrieved.has(id)).length;
  return found / expected.length;
}
