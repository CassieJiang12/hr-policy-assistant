import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePolicyRecords } from './validate-policy-records.js';

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
  cached = readPolicyDocuments(path);
  return cached;
}

export function readPolicyDocuments(path: string): PolicyRecord[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as PoliciesFile;
  return validatePolicyRecords(parsed.documents);
}

export function clearPolicyCache(): void {
  cached = undefined;
}

export function policyById(policies: PolicyRecord[]): Map<string, PolicyRecord> {
  return new Map(policies.map((policy) => [policy.id, policy]));
}

export function resolvePoliciesPath(): string {
  const override = process.env.POLICIES_PATH?.trim();
  if (override) {
    return isAbsolute(override)
      ? override
      : join(process.cwd(), override);
  }

  return join(dirname(fileURLToPath(import.meta.url)), '../../../policies.json');
}
