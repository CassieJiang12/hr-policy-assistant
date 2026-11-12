export type AskStatus = 'answered' | 'needs_clarification' | 'not_found';

export type EvidencePass = 'yes' | 'no' | 'review';

export type ScoreCaseInput = {
  expectedStatus: AskStatus;
  expectedEvidenceIds: string[];
  actualStatus: string | undefined;
  actualSourceIds: string[];
  knownIds: Set<string>;
};

export type ScoreCaseResult = {
  status_pass: boolean;
  evidence_pass: EvidencePass;
  missing_ids: string[];
  extra_ids: string[];
  unknown_ids: string[];
  content_pass: '';
};

export function scoreCase(input: ScoreCaseInput): ScoreCaseResult {
  const expected = unique(input.expectedEvidenceIds);
  const actual = unique(input.actualSourceIds);
  const status_pass = input.actualStatus === input.expectedStatus;
  const unknown_ids = actual.filter((id) => !input.knownIds.has(id));
  const missing_ids = expected.filter((id) => !actual.includes(id));
  const extra_ids = actual.filter((id) => !expected.includes(id));

  let evidence_pass: EvidencePass;
  if (unknown_ids.length > 0 || missing_ids.length > 0) {
    evidence_pass = 'no';
  } else if (extra_ids.length > 0 && expected.length === 0) {
    evidence_pass = 'no';
  } else if (extra_ids.length > 0) {
    evidence_pass = 'review';
  } else {
    evidence_pass = 'yes';
  }

  return {
    status_pass,
    evidence_pass,
    missing_ids,
    extra_ids,
    unknown_ids,
    content_pass: '',
  };
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}
