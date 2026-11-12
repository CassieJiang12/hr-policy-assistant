import { createHash } from 'node:crypto';
import type { PolicyRecord } from '../policies/load-policies.js';

export function hashPolicyContent(records: PolicyRecord[]): string {
  const canonical = [...records]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((record) => `${record.id}\n${record.document}\n${record.text}`)
    .join('\n---\n');
  return createHash('sha256').update(canonical).digest('hex');
}

export function embeddingInput(record: PolicyRecord): string {
  return `${record.document}\n${record.text}`;
}
