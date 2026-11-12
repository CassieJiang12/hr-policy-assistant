import { HttpException } from '@nestjs/common';

export class AppHttpException extends HttpException {
  constructor(
    status: number,
    code: string,
    message: string,
    requestId: string,
  ) {
    super(
      {
        error: { code, message },
        request_id: requestId,
      },
      status,
    );
  }
}
