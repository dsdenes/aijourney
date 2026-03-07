import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    const requestId =
      (request.headers['x-request-id'] as string | undefined) ||
      (request.headers['x-flow-id'] as string | undefined) ||
      'unknown';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (typeof exResponse === 'object' && exResponse !== null) {
        const obj = exResponse as Record<string, unknown>;
        message = (obj['message'] as string) || message;
        code = (obj['code'] as string) || code;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(
        `Unhandled exception ${request.method} ${request.url} (${requestId}): ${exception.message}`,
        exception.stack,
      );
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR && exception instanceof HttpException) {
      this.logger.error(
        `HTTP exception ${request.method} ${request.url} (${requestId})`,
        JSON.stringify(exception.getResponse()),
      );
    }

    response.status(status).json({
      error: {
        code,
        message,
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
        requestId,
      },
    });
  }
}
