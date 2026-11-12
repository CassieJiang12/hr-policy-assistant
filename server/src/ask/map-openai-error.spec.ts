import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
} from 'openai';
import { mapOpenAiFailure } from './openai-ask.js';

describe('mapOpenAiFailure', () => {
  it('maps SDK timeout to UPSTREAM_TIMEOUT without leaking a stack', () => {
    const mapped = mapOpenAiFailure(
      new APIConnectionTimeoutError({ message: 'timeout' }),
      'req-timeout',
    );
    const body = mapped.getResponse() as {
      error: { code: string; message: string };
      request_id: string;
    };
    assert.equal(mapped.getStatus(), 504);
    assert.equal(body.error.code, 'UPSTREAM_TIMEOUT');
    assert.equal(body.request_id, 'req-timeout');
    assert.match(body.error.message, /timed out/i);
    assert.equal(body.error.message.includes('\n'), false);
  });

  it('maps authentication failure to UPSTREAM_AUTH', () => {
    const error = APIError.generate(
      401,
      { error: { message: 'invalid api key', type: 'invalid_request_error' } },
      'invalid api key',
      new Headers(),
    );
    assert.equal(error instanceof AuthenticationError || error.status === 401, true);
    const mapped = mapOpenAiFailure(error, 'req-auth');
    const body = mapped.getResponse() as { error: { code: string } };
    assert.equal(mapped.getStatus(), 502);
    assert.equal(body.error.code, 'UPSTREAM_AUTH');
  });

  it('maps insufficient quota to UPSTREAM_QUOTA', () => {
    const error = APIError.generate(
      429,
      { error: { code: 'insufficient_quota', message: 'quota' } },
      'quota',
      new Headers(),
    );
    const mapped = mapOpenAiFailure(error, 'req-quota');
    const body = mapped.getResponse() as { error: { code: string } };
    assert.equal(mapped.getStatus(), 503);
    assert.equal(body.error.code, 'UPSTREAM_QUOTA');
  });

  it('maps a generic abort to ASK_DEADLINE', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const mapped = mapOpenAiFailure(abort, 'req-deadline');
    const body = mapped.getResponse() as { error: { code: string } };
    assert.equal(mapped.getStatus(), 504);
    assert.equal(body.error.code, 'ASK_DEADLINE');
  });
});
