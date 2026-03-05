import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * Extract tenantId from the request (set by TenantContextMiddleware).
 * Usage: @TenantId() tenantId: string
 */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.tenantId as string | undefined;
});
