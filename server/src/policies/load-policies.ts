import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type PolicyRecord = {
  id: string;
  document: string;
  text: string;
};

type PoliciesFile = {
  fictional?: boolean;
  company?: string;
  documents: PolicyRecord[];
};

let cached: PolicyRecord[] | undefined;

export function loadPolicies(): PolicyRecord[] {
  if (cached) {
    return cached;
  }

  const path = resolvePoliciesPath();
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as PoliciesFile;
  if (!Array.isArray(parsed.documents) || parsed.documents.length === 0) {
    throw new Error('policies.json must contain a documents array.');
  }

  cached = parsed.documents.map((row) => ({
    id: row.id,
    document: row.document,
    text: row.text,
  }));
  return cached;
}

export function policyById(policies: PolicyRecord[]): Map<string, PolicyRecord> {
  return new Map(policies.map((policy) => [policy.id, policy]));
}

function resolvePoliciesPath(): string {
  const override = process.env.POLICIES_PATH?.trim();
  if (override) {
    return isAbsolute(override)
      ? override
      : join(process.cwd(), override);
  }

  return join(dirname(fileURLToPath(import.meta.url)), '../../../policies.json');
}
