# HR Policy Assistant

Policy Q&A for fictional DemoCo HR documents. A React UI sends a question to a NestJS API, which answers from six local policy records using the OpenAI Responses API and structured JSON (`status`, `answer`, `evidence_ids`). Source excerpts are taken from `policies.json`, not from model-generated text.

## Setup

Node.js 22+ and npm 10+.

```bash
cd client && npm install
cd ../server && npm install
cp server/.env.example server/.env
```

In `server/.env` set `OPENAI_API_KEY` and `OPENAI_MODEL`. Keep secrets out of the client and Git.

## Run

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

`ASK_MODE=mock` uses a local fixture. `ASK_MODE=real` (default) calls the model and does not fall back to mock on failure.

## Scripts

```bash
cd server && npm run typecheck && npm run build && npm test
cd client && npm run typecheck && npm run build
cd server && npm run eval:cases   # requires a running real-mode API
```

Eval writes `eval_results.csv` and `eval_run.jsonl`. Status and evidence IDs are scored automatically; `content_pass` is left for manual review.

## Layout

```
client/     React + Vite UI
server/     NestJS API
policies.json
eval_cases.json
```

Timeouts: 15s per OpenAI attempt, one retry, 35s overall deadline (`OPENAI_TIMEOUT_MS`, `OPENAI_MAX_RETRIES`, `ASK_DEADLINE_MS`).
