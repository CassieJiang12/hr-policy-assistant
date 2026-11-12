import type { AskStatus, PolicySource } from './ask.types.js';

export const MOCK_ASK_FIXTURE_NAME = 'mock-fixture';

export const MOCK_DISCLAIMER = '[MOCK]';

const REM_01: PolicySource = {
  id: 'REM-01',
  document: 'Remote Work Policy',
  text: 'US full-time employees may work remotely up to 2 days per week with manager approval.',
};

const PTO_01: PolicySource = {
  id: 'PTO-01',
  document: 'Leave Policy',
  text: 'US full-time employees receive 15 paid vacation days per calendar year.',
};

export type MockAskPayload = {
  status: AskStatus;
  answer: string;
  sources: PolicySource[];
};

export function selectMockAskFixture(question: string): MockAskPayload {
  const normalized = question.toLowerCase();

  if (normalized.includes('401(k)') || normalized.includes('401k')) {
    return {
      status: 'not_found',
      answer: `${MOCK_DISCLAIMER} Existing DemoCo policy records do not mention 401(k) matching.`,
      sources: [],
    };
  }

  const mentionsVacation = normalized.includes('vacation');
  const mentionsUsFullTime =
    normalized.includes('us full-time') ||
    normalized.includes('us full time') ||
    (normalized.includes('full-time') && normalized.includes('us ')) ||
    (normalized.includes('full time') && normalized.includes('us '));

  if (mentionsVacation && !mentionsUsFullTime) {
    return {
      status: 'needs_clarification',
      answer: `${MOCK_DISCLAIMER} Are you a US full-time employee? Leave Policy PTO-01 applies only to that group.`,
      sources: [],
    };
  }

  if (
    normalized.includes('work from home') ||
    normalized.includes('work remotely') ||
    normalized.includes('remote')
  ) {
    return {
      status: 'answered',
      answer: `${MOCK_DISCLAIMER} You may work remotely up to 2 days per week with manager approval.`,
      sources: [REM_01],
    };
  }

  if (mentionsVacation && mentionsUsFullTime) {
    return {
      status: 'answered',
      answer: `${MOCK_DISCLAIMER} US full-time employees receive 15 paid vacation days per calendar year.`,
      sources: [PTO_01],
    };
  }

  return {
    status: 'not_found',
    answer: `${MOCK_DISCLAIMER} No matching stub exists for this question. This is still a fixture, not a model lookup.`,
    sources: [],
  };
}
