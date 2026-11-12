import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppHttpException } from '../http/app-http.exception.js';
import { parseQuestion } from './ask.controller.js';

describe('parseQuestion', () => {
  it('accepts a trimmed 1–1000 character string', () => {
    assert.equal(parseQuestion({ question: '  Hello  ' }, 'req-1'), 'Hello');
  });

  it('rejects a missing body', () => {
    assert.throws(
      () => parseQuestion(null, 'req-1'),
      (error: unknown) => isInvalidQuestion(error),
    );
  });

  it('rejects a non-string question', () => {
    assert.throws(
      () => parseQuestion({ question: 12 }, 'req-1'),
      (error: unknown) => isInvalidQuestion(error),
    );
  });

  it('rejects whitespace-only questions', () => {
    assert.throws(
      () => parseQuestion({ question: '   ' }, 'req-1'),
      (error: unknown) => isInvalidQuestion(error),
    );
  });

  it('rejects questions longer than 1000 characters after trim', () => {
    assert.throws(
      () => parseQuestion({ question: 'x'.repeat(1001) }, 'req-1'),
      (error: unknown) => isInvalidQuestion(error),
    );
  });
});

function isInvalidQuestion(error: unknown): boolean {
  return (
    error instanceof AppHttpException &&
    error.getStatus() === 400 &&
    JSON.stringify(error.getResponse()).includes('INVALID_QUESTION')
  );
}
