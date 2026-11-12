import type { PolicyRecord } from '../policies/load-policies.js';
import type { AskStatus, PolicySource } from './ask.types.js';
import type { ModelAskOutput } from './model-schema.js';

export type ValidatedAsk = {
  status: AskStatus;
  answer: string;
  sources: PolicySource[];
};

export class ModelOutputValidationError extends Error {
  readonly code = 'MODEL_OUTPUT_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'ModelOutputValidationError';
  }
}

export function validateModelOutput(
  output: ModelAskOutput,
  policies: PolicyRecord[],
): ValidatedAsk {
  const answer = output.answer.trim();
  if (answer.length === 0) {
    throw new ModelOutputValidationError('The model returned an empty answer.');
  }

  const byId = new Map(policies.map((policy) => [policy.id, policy]));
  const evidenceIds = dedupe(output.evidence_ids.map((id) => id.trim()).filter(Boolean));

  if (output.status === 'answered') {
    if (evidenceIds.length === 0) {
      throw new ModelOutputValidationError(
        'status answered requires at least one evidence_id.',
      );
    }
  } else if (evidenceIds.length > 0) {
    throw new ModelOutputValidationError(
      `${output.status} requires evidence_ids to be empty.`,
    );
  }

  const unknown = evidenceIds.filter((id) => !byId.has(id));
  if (unknown.length > 0) {
    throw new ModelOutputValidationError(
      `Evidence IDs were not in the policy excerpts provided to the model: ${unknown.join(', ')}.`,
    );
  }

  const sources: PolicySource[] = evidenceIds.map((id) => {
    const policy = byId.get(id)!;
    return {
      id: policy.id,
      document: policy.document,
      text: policy.text,
    };
  });

  return {
    status: output.status,
    answer,
    sources,
  };
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}
