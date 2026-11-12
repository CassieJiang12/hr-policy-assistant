import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasRealApiConfig } from '../config/app-config.js';
import { AppHttpException } from '../http/app-http.exception.js';
import { retrievePolicies } from '../retrieval/retrieve.js';
import { recallAtK } from './recall.js';

type RetrievalEvalCase = {
  id: string;
  expected_retrieval_ids?: string[];
  question: string;
};

if (!hasRealApiConfig()) {
  console.error(
    'OPENAI_API_KEY and OPENAI_MODEL are required. This command calls the embeddings API and is not a substitute for npm test.',
  );
  process.exit(1);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const cases = JSON.parse(
  readFileSync(join(repoRoot, 'eval_cases.json'), 'utf8'),
) as RetrievalEvalCase[];

const lines: string[] = [];
const recalls: number[] = [];

for (const evalCase of cases) {
  const expected = evalCase.expected_retrieval_ids ?? [];
  let result;
  try {
    result = await retrievePolicies(evalCase.question, { requestId: evalCase.id });
  } catch (error) {
    if (error instanceof AppHttpException) {
      const body = error.getResponse() as { error?: { code?: string; message?: string } };
      console.error(
        `${evalCase.id} ${body.error?.code ?? 'ERROR'}: ${body.error?.message ?? 'Retrieval failed.'}`,
      );
    } else {
      console.error(`${evalCase.id} retrieval failed.`);
    }
    process.exit(1);
  }

  const recall = recallAtK(expected, result.telemetry.retrieval_ids);
  if (recall !== null) {
    recalls.push(recall);
  }
  lines.push(
    JSON.stringify({
      case_id: evalCase.id,
      expected_retrieval_ids: expected,
      retrieval_ids: result.telemetry.retrieval_ids,
      retrieval_scores: result.telemetry.retrieval_scores,
      retrieval_latency_ms: result.telemetry.retrieval_latency_ms,
      embedding_usage: result.telemetry.embedding_usage,
      recall_at_k: recall,
    }),
  );
  console.log(
    `${evalCase.id} recall=${recall === null ? 'n/a' : recall.toFixed(2)} ids=${result.telemetry.retrieval_ids.join(',') || '(none)'}`,
  );
}

const outputPath = join(repoRoot, 'retrieval_eval.jsonl');
writeFileSync(outputPath, `${lines.join('\n')}\n`);
const mean =
  recalls.length === 0 ? null : recalls.reduce((sum, value) => sum + value, 0) / recalls.length;
console.log('');
console.log(`Wrote ${outputPath}`);
console.log(
  mean === null
    ? 'No cases had labeled retrieval ids, so mean recall@K was not computed.'
    : `Mean recall@K over ${recalls.length} labeled cases: ${mean.toFixed(3)}.`,
);
console.log(
  'This file is a live embedding measurement. npm test uses stub vectors and does not measure semantic retrieval. Answer text is not scored here.',
);
