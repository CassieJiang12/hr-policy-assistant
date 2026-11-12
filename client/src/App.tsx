import { useEffect, useRef, useState, type KeyboardEvent, type SubmitEvent } from 'react';
import {
  ApiError,
  askQuestion,
  fetchHealth,
  type AskStatus,
  type AskSuccessResponse,
  type HealthResponse,
} from './api.ts';

const EXAMPLE_QUESTIONS = [
  'As a US full-time employee, can I work from home twice a week?',
  'Does DemoCo match my 401(k) contributions?',
  'How many vacation days do I get?',
] as const;

const STATUS_LABEL: Record<AskStatus, string> = {
  answered: 'Answered',
  needs_clarification: 'Needs clarification',
  not_found: 'Not found',
};

type UiState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; data: AskSuccessResponse }
  | { kind: 'error'; message: string };

export default function App() {
  const [question, setQuestion] = useState('');
  const [ui, setUi] = useState<UiState>({ kind: 'idle' });
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const waiting = ui.kind === 'loading';
  const trimmedLength = question.trim().length;
  const isInvalidLength = trimmedLength === 0 || trimmedLength > 1000;
  const disableSubmit = waiting || isInvalidLength;
  const mode = health?.mode ?? 'real';

  async function submitQuestion() {
    if (disableSubmit || inFlight.current) {
      return;
    }
    inFlight.current = true;
    setUi({ kind: 'loading' });
    try {
      const data = await askQuestion(question);
      setUi({ kind: 'success', data });
    } catch (error) {
      setUi({
        kind: 'error',
        message: describeError(error),
      });
    } finally {
      inFlight.current = false;
    }
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitQuestion();
  }

  function onQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submitQuestion();
    }
  }

  return (
    <main>
      <ModeBanner health={health} />
      <h1>HR Policy Assistant</h1>
      <p className="lede">Ask a question about DemoCo HR policies.</p>

      <form onSubmit={onSubmit}>
        <label htmlFor="question">Question</label>
        <textarea
          id="question"
          name="question"
          rows={4}
          maxLength={2000}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={onQuestionKeyDown}
          placeholder="Type a policy question. Ctrl/⌘+Enter submits."
          disabled={waiting}
        />
        <p className="hint">{trimmedLength} characters after trim (limit 1000)</p>
        <button type="submit" disabled={disableSubmit} aria-busy={waiting}>
          {waiting ? 'Asking…' : 'Ask'}
        </button>
      </form>

      <section aria-label="Example questions">
        <h2>Example questions</h2>
        <ul>
          {EXAMPLE_QUESTIONS.map((example) => (
            <li key={example}>
              <button
                type="button"
                className="example"
                disabled={waiting}
                onClick={() => setQuestion(example)}
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-live="polite" aria-busy={waiting}>
        {waiting && (
          <p className="loading" role="status">
            {mode === 'mock' ? 'Loading mock response…' : 'Calling the model…'}
          </p>
        )}
        {ui.kind === 'error' && (
          <p className="error" role="alert">
            {ui.message}
          </p>
        )}
        {ui.kind === 'success' && <AnswerPanel data={ui.data} />}
      </section>
    </main>
  );
}

function ModeBanner({ health }: { health: HealthResponse | null }) {
  if (!health) {
    return (
      <p className="mode-banner mode-unknown" role="status">
        Could not load API health.
      </p>
    );
  }

  if (health.mode === 'mock') {
    return (
      <p className="mode-banner mode-mock" role="status">
        Mock mode
      </p>
    );
  }

  if (!health.real_configured) {
    return (
      <p className="mode-banner mode-real-unconfigured" role="status">
        Real mode — API key or model is not configured.
      </p>
    );
  }

  return (
    <p className="mode-banner mode-real" role="status">
      Real mode
    </p>
  );
}

function AnswerPanel({ data }: { data: AskSuccessResponse }) {
  return (
    <article className="answer">
      <p className={data.mode === 'mock' ? 'fixture-label' : 'real-label'}>
        {data.mode === 'mock' ? 'Mock' : `Real${data.prompt_version ? ` · ${data.prompt_version}` : ''}`}
      </p>
      <p>
        <strong>Status:</strong> {STATUS_LABEL[data.status]}
      </p>
      <p>{data.answer}</p>
      {data.sources.length > 0 ? (
        <section className="sources" aria-label="Policy sources">
          <h2>Sources</h2>
          <p className="hint">Excerpts from the policy records.</p>
          {data.sources.map((source) => (
            <details key={source.id} className="source-card">
              <summary>
                {source.document} / {source.id}
              </summary>
              <p>{source.text}</p>
            </details>
          ))}
        </section>
      ) : (
        <p className="hint">No sources.</p>
      )}
      <p className="meta">
        request_id {data.request_id} · {data.latency_ms} ms
      </p>
    </article>
  );
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.code ? ` [${error.code}]` : '';
    const id = error.requestId ? ` request_id ${error.requestId}.` : '';
    if (error.statusCode === 400) {
      return `Invalid question${code}: ${error.message}${id}`;
    }
    return `${error.message}${code}${id}`;
  }

  if (error instanceof TypeError) {
    return 'Could not reach the API. Is the Nest server running on port 3000, and is the Vite /api proxy active? You can retry.';
  }

  return 'Something went wrong. You can retry.';
}
