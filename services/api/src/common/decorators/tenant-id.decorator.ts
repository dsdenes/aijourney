import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * Extract tenantId from the authenticated request.
 * Usage: @TenantId() tenantId: string
 */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest() as {
    tenantId?: string;
    user?: { tenantId?: string };
  };
  return request.user?.tenantId ?? request.tenantId;
});
