import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { ulid } from 'ulid';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId =
      (request.headers['x-request-id'] as string) ||
      (request.headers['x-flow-id'] as string) ||
      ulid();
    request.headers['x-request-id'] = requestId;
    request.headers['x-flow-id'] = requestId;

    const response = context.switchToHttp().getResponse();
    response.setHeader('x-request-id', requestId);
    response.setHeader('x-flow-id', requestId);

    return next.handle();
  }
}
