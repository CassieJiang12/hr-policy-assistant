import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreCase, type AskStatus } from './score-case.js';

type EvalCase = {
  id: string;
  category: string;
  question: string;
  expected_status: AskStatus;
  expected_evidence_ids: string[];
  rubric: string;
};

type HealthResponse = {
  status: string;
  mode?: string;
  real_configured?: boolean;
  model?: string | null;
};

type AskResponse = {
  status?: string;
  answer?: string;
  sources?: { id: string; document: string; text: string }[];
  request_id?: string;
  latency_ms?: number;
  mode?: string;
  prompt_version?: string;
};

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const baseUrl = (process.env.EVAL_API_BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const runTimestamp = new Date().toISOString();

const cases = JSON.parse(
  readFileSync(join(repoRoot, 'eval_cases.json'), 'utf8'),
) as EvalCase[];

const policies = JSON.parse(
  readFileSync(join(repoRoot, 'policies.json'), 'utf8'),
) as { documents: { id: string }[] };

const knownIds = new Set(policies.documents.map((row) => row.id));

const health = await readHealth();
if (health.mode !== 'real') {
  console.error(
    `Eval requires real mode. Health mode=${health.mode ?? 'unknown'} at ${baseUrl}/api/health.`,
  );
  process.exit(1);
}
if (!health.real_configured) {
  console.error(
    'Refusing to score: real mode is not configured (OPENAI_API_KEY / OPENAI_MODEL).',
  );
  process.exit(1);
}

const model = health.model ?? process.env.OPENAI_MODEL ?? '';
const jsonlLines: string[] = [];
const csvRows = [
  'case_id,prompt_version,model,run_timestamp,status_pass,evidence_pass,content_pass,latency_ms,notes',
];

let statusAutoPass = 0;
let evidenceAutoYes = 0;
let requestFailures = 0;

for (const evalCase of cases) {
  const started = Date.now();
  const result = await postAsk(evalCase.question);
  const wallMs = Date.now() - started;
  const actualIds = (result.body.sources ?? []).map((source) => source.id);
  const promptVersion = result.body.prompt_version ?? '';
  const latency = result.body.latency_ms ?? wallMs;

  if (!result.ok) {
    requestFailures += 1;
    const notes = `TECHNICAL_FAILURE status=${result.status} ${result.error}`;
    csvRows.push(
      [
        evalCase.id,
        csv(promptVersion),
        csv(model),
        csv(runTimestamp),
        'no',
        'no',
        '',
        String(wallMs),
        csv(notes),
      ].join(','),
    );
    jsonlLines.push(
      JSON.stringify({
        case_id: evalCase.id,
        category: evalCase.category,
        prompt_version: promptVersion,
        model,
        run_timestamp: runTimestamp,
        question: evalCase.question,
        expected_status: evalCase.expected_status,
        expected_evidence_ids: evalCase.expected_evidence_ids,
        actual_status: null,
        actual_answer: null,
        actual_source_ids: [],
        request_id: null,
        latency_ms: wallMs,
        status_pass: false,
        evidence_pass: 'no',
        content_pass: null,
        rubric: evalCase.rubric,
        notes,
      }),
    );
    console.log(`${evalCase.id} TECHNICAL_FAILURE ${result.status}`);
    continue;
  }

  const scored = scoreCase({
    expectedStatus: evalCase.expected_status,
    expectedEvidenceIds: evalCase.expected_evidence_ids,
    actualStatus: result.body.status,
    actualSourceIds: actualIds,
    knownIds,
  });

  if (scored.status_pass) {
    statusAutoPass += 1;
  }
  if (scored.evidence_pass === 'yes') {
    evidenceAutoYes += 1;
  }

  const noteParts = [
    scored.unknown_ids.length > 0 ? `unknown_ids=${scored.unknown_ids.join('|')}` : '',
    scored.missing_ids.length > 0 ? `missing_ids=${scored.missing_ids.join('|')}` : '',
    scored.extra_ids.length > 0 ? `extra_ids=${scored.extra_ids.join('|')}` : '',
  ].filter(Boolean);

  csvRows.push(
    [
      evalCase.id,
      csv(promptVersion),
      csv(model),
      csv(runTimestamp),
      scored.status_pass ? 'yes' : 'no',
      scored.evidence_pass,
      '',
      String(latency),
      csv(noteParts.join('; ')),
    ].join(','),
  );

  jsonlLines.push(
    JSON.stringify({
      case_id: evalCase.id,
      category: evalCase.category,
      prompt_version: promptVersion,
      model,
      run_timestamp: runTimestamp,
      question: evalCase.question,
      expected_status: evalCase.expected_status,
      expected_evidence_ids: evalCase.expected_evidence_ids,
      actual_status: result.body.status ?? null,
      actual_answer: result.body.answer ?? null,
      actual_source_ids: actualIds,
      request_id: result.body.request_id ?? null,
      latency_ms: latency,
      status_pass: scored.status_pass,
      evidence_pass: scored.evidence_pass,
      content_pass: null,
      rubric: evalCase.rubric,
      notes: noteParts.join('; '),
    }),
  );

  console.log(
    `${evalCase.id} status=${scored.status_pass ? 'yes' : 'no'} evidence=${scored.evidence_pass}`,
  );
}

const csvPath = join(repoRoot, 'eval_results.csv');
const jsonlPath = join(repoRoot, 'eval_run.jsonl');
writeFileSync(csvPath, `${csvRows.join('\n')}\n`);
writeFileSync(jsonlPath, `${jsonlLines.join('\n')}\n`);

console.log('');
console.log(`Wrote ${csvPath}`);
console.log(`Wrote ${jsonlPath}`);
console.log(
  `status pass ${statusAutoPass}/${cases.length}; evidence yes ${evidenceAutoYes}/${cases.length}; failures ${requestFailures}`,
);

async function readHealth(): Promise<HealthResponse> {
  try {
    const response = await fetch(`${baseUrl}/api/health`);
    if (!response.ok) {
      console.error(`Health check failed: ${response.status}`);
      process.exit(1);
    }
    return (await response.json()) as HealthResponse;
  } catch {
    console.error(
      `Could not reach ${baseUrl}/api/health. Start the Nest server in real mode first.`,
    );
    process.exit(1);
  }
}

async function postAsk(question: string): Promise<{
  ok: boolean;
  status: number;
  body: AskResponse;
  error: string;
}> {
  const response = await fetch(`${baseUrl}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = readError(payload);
    return { ok: false, status: response.status, body: {}, error: message };
  }
  return {
    ok: true,
    status: response.status,
    body: (payload ?? {}) as AskResponse,
    error: '',
  };
}

function readError(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const record = payload as {
      error?: { code?: unknown; message?: unknown };
      message?: unknown;
    };
    const code = typeof record.error?.code === 'string' ? record.error.code : '';
    const message =
      typeof record.error?.message === 'string'
        ? record.error.message
        : typeof record.message === 'string'
          ? record.message
          : '';
    return [code, message].filter(Boolean).join(' ');
  }
  return 'unreadable error body';
}

function csv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}
