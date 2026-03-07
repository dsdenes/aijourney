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
    const requestHeaders = request?.headers ?? {};
    const requestMethod = request?.method ?? 'UNKNOWN';
    const requestUrl = request?.url ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    const requestId =
      (requestHeaders['x-request-id'] as string | undefined) ||
      (requestHeaders['x-flow-id'] as string | undefined) ||
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
        `Unhandled exception ${requestMethod} ${requestUrl} (${requestId}): ${exception.message}`,
        exception.stack,
      );
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR && exception instanceof HttpException) {
      this.logger.error(
        `HTTP exception ${requestMethod} ${requestUrl} (${requestId})`,
        JSON.stringify(exception.getResponse()),
      );
    }

    response.status(status).json({
      error: {
        code,
        message,
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: requestUrl,
        requestId,
      },
    });
  }
}
