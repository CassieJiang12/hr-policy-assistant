import type { PolicyRecord } from './load-policies.js';

export class PolicyDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyDataError';
  }
}

export function validatePolicyRecords(records: unknown): PolicyRecord[] {
  if (!Array.isArray(records) || records.length === 0) {
    throw new PolicyDataError('policies.json must contain a non-empty documents array.');
  }

  const seen = new Set<string>();
  return records.map((record: unknown, index) => {
    const row = record as { id?: unknown; document?: unknown; text?: unknown };
    const id = requiredText(row?.id, `documents[${index}].id`);
    const document = requiredText(row?.document, `documents[${index}].document`);
    const text = requiredText(row?.text, `documents[${index}].text`);
    if (seen.has(id)) {
      throw new PolicyDataError(`Duplicate policy id: ${id}.`);
    }
    seen.add(id);
    return { id, document, text };
  });
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new PolicyDataError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}
