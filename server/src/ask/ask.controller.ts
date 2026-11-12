import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { AppHttpException } from '../http/app-http.exception.js';
import { AskService } from './ask.service.js';
import type { AskSuccessResponse } from './ask.types.js';

@Controller('ask')
export class AskController {
  constructor(private readonly askService: AskService) {}

  @Post()
  async ask(@Body() body: unknown): Promise<AskSuccessResponse> {
    const requestId = crypto.randomUUID();
    const question = parseQuestion(body, requestId);
    return this.askService.answerQuestion(question, requestId);
  }
}

export function parseQuestion(body: unknown, requestId: string): string {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppHttpException(
      HttpStatus.BAD_REQUEST,
      'INVALID_QUESTION',
      'Request body must be a JSON object with a question string.',
      requestId,
    );
  }

  const question = (body as { question?: unknown }).question;
  if (typeof question !== 'string') {
    throw new AppHttpException(
      HttpStatus.BAD_REQUEST,
      'INVALID_QUESTION',
      'question must be a string.',
      requestId,
    );
  }

  const trimmed = question.trim();
  if (trimmed.length < 1 || trimmed.length > 1000) {
    throw new AppHttpException(
      HttpStatus.BAD_REQUEST,
      'INVALID_QUESTION',
      'question must be 1–1000 characters after trimming.',
      requestId,
    );
  }

  return trimmed;
}
