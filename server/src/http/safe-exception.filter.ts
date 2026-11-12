import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppHttpException } from './app-http.exception.js';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppHttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: {
          code: status === HttpStatus.BAD_REQUEST ? 'INVALID_QUESTION' : 'REQUEST_FAILED',
          message: safeHttpMessage(exception, status),
        },
        request_id: 'unknown',
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected server error occurred. You can retry.',
      },
      request_id: 'unknown',
    });
  }
}

function safeHttpMessage(exception: HttpException, status: number): string {
  const body = exception.getResponse();
  if (typeof body === 'string' && body.trim().length > 0 && body.length < 300) {
    return body;
  }
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0 && message.length < 300) {
      return message;
    }
  }
  if (status === HttpStatus.BAD_REQUEST) {
    return 'question must be 1–1000 characters after trimming.';
  }
  return 'The request failed. You can retry.';
}
