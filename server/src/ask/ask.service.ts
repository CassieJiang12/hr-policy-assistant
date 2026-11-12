import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  getAskMode,
  getTimeoutSettings,
  hasRealApiConfig,
  readOpenAiSettings,
} from '../config/app-config.js';
import { AppHttpException } from '../http/app-http.exception.js';
import { loadPolicies } from '../policies/load-policies.js';
import type { AskSuccessResponse } from './ask.types.js';
import { MOCK_ASK_FIXTURE_NAME, selectMockAskFixture } from './mock-ask.fixture.js';
import { requestStructuredAsk } from './openai-ask.js';
import { buildPolicyInstructions, PROMPT_VERSION } from './policy-prompt.js';
import {
  ModelOutputValidationError,
  validateModelOutput,
} from './validate-model-output.js';

@Injectable()
export class AskService {
  private readonly logger = new Logger(AskService.name);

  async answerQuestion(
    question: string,
    requestId = crypto.randomUUID(),
  ): Promise<AskSuccessResponse> {
    const started = Date.now();
    const mode = getAskMode();

    try {
      const result =
        mode === 'mock'
          ? this.answerFromMock(question, requestId, started)
          : await this.answerFromModel(question, requestId, started);

      this.logger.log(
        JSON.stringify({
          request_id: requestId,
          mode,
          result: result.status,
          latency_ms: result.latency_ms,
          usage: result.usage ?? null,
        }),
      );
      const { usage: _usage, ...payload } = result;
      return payload;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          request_id: requestId,
          mode,
          result: 'error',
          latency_ms: Date.now() - started,
          usage: null,
        }),
      );
      if (error instanceof AppHttpException) {
        throw error;
      }
      throw new AppHttpException(
        HttpStatus.BAD_GATEWAY,
        'UPSTREAM_ERROR',
        'The model request failed. You can retry.',
        requestId,
      );
    }
  }

  private answerFromMock(
    question: string,
    requestId: string,
    started: number,
  ): AskSuccessResponse {
    const fixture = selectMockAskFixture(question);
    return {
      status: fixture.status,
      answer: fixture.answer,
      sources: fixture.sources,
      request_id: requestId,
      latency_ms: Date.now() - started,
      mode: 'mock',
      fixture: MOCK_ASK_FIXTURE_NAME,
      usage: null,
    };
  }

  private async answerFromModel(
    question: string,
    requestId: string,
    started: number,
  ): Promise<AskSuccessResponse> {
    if (!hasRealApiConfig()) {
      throw new AppHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'MISSING_CONFIGURATION',
        'OPENAI_API_KEY and OPENAI_MODEL are required in server/.env.',
        requestId,
      );
    }

    const policies = loadPolicies();
    const modelResult = await requestStructuredAsk({
      settings: readOpenAiSettings(),
      timeouts: getTimeoutSettings(),
      instructions: buildPolicyInstructions(policies),
      question,
      requestId,
    });

    try {
      const validated = validateModelOutput(modelResult.output, policies);
      return {
        status: validated.status,
        answer: validated.answer,
        sources: validated.sources,
        request_id: requestId,
        latency_ms: Date.now() - started,
        mode: 'real',
        prompt_version: PROMPT_VERSION,
        usage: modelResult.usage,
      };
    } catch (error) {
      if (error instanceof ModelOutputValidationError) {
        throw new AppHttpException(
          HttpStatus.BAD_GATEWAY,
          error.code,
          error.message,
          requestId,
        );
      }
      throw error;
    }
  }
}
