import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  getAskMode,
  getTimeoutSettings,
  hasRealApiConfig,
  readOpenAiSettings,
} from '../config/app-config.js';
import { AppHttpException } from '../http/app-http.exception.js';
import { retrievePolicies } from '../retrieval/retrieve.js';
import { runAskFlow } from './ask-flow.js';
import type { AskSuccessResponse } from './ask.types.js';
import { requestStructuredAsk } from './openai-ask.js';

@Injectable()
export class AskService {
  private readonly logger = new Logger(AskService.name);

  async answerQuestion(
    question: string,
    requestId = crypto.randomUUID(),
  ): Promise<AskSuccessResponse> {
    const started = Date.now();
    const mode = getAskMode();
    const controller = new AbortController();
    const timeouts = getTimeoutSettings();
    const deadline =
      mode === 'real'
        ? setTimeout(() => controller.abort(), timeouts.deadlineMs)
        : undefined;

    try {
      const settings = readOpenAiSettings();
      if (mode === 'real' && !hasRealApiConfig()) {
        throw new AppHttpException(
          HttpStatus.SERVICE_UNAVAILABLE,
          'MISSING_CONFIGURATION',
          'OPENAI_API_KEY and OPENAI_MODEL are required in server/.env.',
          requestId,
        );
      }

      const result = await runAskFlow({
        mode,
        question,
        requestId,
        started,
        signal: controller.signal,
        onRetrieval: (telemetry) => {
          this.logger.log(
            JSON.stringify({
              request_id: requestId,
              event: 'retrieval',
              retrieval_ids: telemetry.retrieval_ids,
              retrieval_scores: telemetry.retrieval_scores,
              retrieval_latency_ms: telemetry.retrieval_latency_ms,
              embedding_usage: telemetry.embedding_usage,
            }),
          );
        },
        retrieve:
          mode === 'real'
            ? (text, signal) =>
                retrievePolicies(text, {
                  signal,
                  timeouts,
                  requestId,
                })
            : undefined,
        generate:
          mode === 'real'
            ? (input) =>
                requestStructuredAsk({
                  settings,
                  timeouts,
                  instructions: input.instructions,
                  question: input.question,
                  requestId,
                  signal: input.signal,
                })
            : undefined,
      });

      this.logger.log(
        JSON.stringify({
          request_id: requestId,
          event: 'answer',
          mode,
          result: result.body.status,
          latency_ms: result.body.latency_ms,
          generation_usage: result.generation_usage,
        }),
      );
      const { usage: _usage, ...payload } = result.body;
      return payload;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          request_id: requestId,
          event: 'answer',
          mode,
          result: 'error',
          latency_ms: Date.now() - started,
          generation_usage: null,
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
    } finally {
      if (deadline) {
        clearTimeout(deadline);
      }
    }
  }
}
