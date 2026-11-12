# HR Policy Assistant

Policy Q&A for fictional DemoCo HR documents. A React UI sends a question to a NestJS API. In real mode the API embeds the question, retrieves the closest of six local policy records from an in-memory JSON index, and asks the OpenAI Responses API for structured JSON (`status`, `answer`, `evidence_ids`). Source excerpts are copied from the retrieved `policies.json` records, not from model-generated text.

Checking that a citation ID was in the retrieved set does not prove the answer is semantically supported. `content_pass` stays a manual review field.

## Setup

Node.js 22+ and npm 10+.

```bash
cd client && npm install
cd ../server && npm install
cp server/.env.example server/.env
```

In `server/.env` set `OPENAI_API_KEY` and `OPENAI_MODEL`. Keep secrets out of the client, logs, and Git.

## Index, then run

Indexing and query-time retrieval are separate. `npm run index:policies` embeds each policy title and text once and writes `server/data/policy-index.json`. A question does not build or refresh that file. Real mode requires the index; mock mode does not.

```bash
cd server && npm run index:policies
```

Terminal 1:

```bash
cd server && npm run start:dev
```

API: http://localhost:3000/api/health  
UI is not served on port 3000.

Terminal 2:

```bash
cd client && npm run dev
```

App: http://localhost:5173 (`/api` is proxied to the Nest server).

After changing `policies.json`, run `npm run index:policies` again and restart the API. The running process keeps the index it already loaded. A hash mismatch fails the request with `INDEX_STALE` instead of sending every policy to the model.

`ASK_MODE=mock` answers from a local fixture and does not read the index or call embeddings. `ASK_MODE=real` (default) does not fall back to mock when retrieval or generation fails.

## Configuration

| Variable | Default | Role |
| --- | --- | --- |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Model used to build the index and embed questions. Both must match. |
| `POLICY_INDEX_PATH` | `data/policy-index.json` | Index path relative to the `server/` working directory. |
| `RETRIEVAL_TOP_K` | `3` | Maximum records passed to the model. Ties break by policy ID. |
| `EMBEDDING_DIMENSIONS` | unset | Optional. If set, it must match the saved index. |
| `RETRIEVAL_MIN_SCORE` | unset | Optional cosine cutoff. It is not calibrated; leave it unset until you measure scores on this corpus. |
| `POLICIES_PATH` | repo `policies.json` | Same file must be used for indexing and for the API. |

Timeouts cover retrieval and generation together: 15s per OpenAI attempt, one retry, 35s overall (`OPENAI_TIMEOUT_MS`, `OPENAI_MAX_RETRIES`, `ASK_DEADLINE_MS`).

## Scripts

```bash
cd server && npm run typecheck && npm run build && npm test
cd client && npm run typecheck && npm run build
cd server && npm run eval:retrieval   # live embeddings; requires the index and API key
cd server && npm run eval:cases       # live answers; requires a running real-mode API
```

`npm test` stubs embeddings and does not measure semantic retrieval. `eval:retrieval` writes `retrieval_eval.jsonl` and computes recall@K only for cases with `expected_retrieval_ids`. Cases with an empty retrieval label, such as the 401(k) question, are omitted from that mean. It does not score answer text. `eval:cases` writes `eval_results.csv` and `eval_run.jsonl`. Status and final evidence IDs are scored automatically; `content_pass` is left blank for manual review.

A clarification case can retrieve `PTO-01` and still return no source cards. A carryover or payout question can retrieve the vacation allowance and still be `not_found`.

## Limits

This is a six-record demonstration. The records are the chunks; they are not split further. The index is a local JSON file loaded into the API process, not a vector database. Top-K retrieval is not a search of every company policy, and the prompt tells the model not to claim that it is. There is no upload, authentication, or separate retrieval service.

Logs include retrieval IDs, scores, retrieval latency, and embedding token usage separately from generation usage. They do not include the API key, the question, or policy text.
