import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GLOBAL_ROLES_KEY } from '../common/decorators/global-roles.decorator';
import { ORG_ROLES_KEY } from '../common/decorators/org-roles.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';

/**
 * Two-tier RBAC guard:
 *
 * 1. **@GlobalRoles("superadmin")** — checks `user.globalRole`. Superadmins bypass all org checks.
 * 2. **@OrgRoles("owner", "admin")** — checks `user.orgRole` within the tenant context.
 * 3. **@Roles("admin")** (legacy) — checks the old `user.role` field for backward compat.
 *
 * If no role decorators are present on a handler, the guard allows access (authentication-only).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredGlobalRoles = this.reflector.getAllAndOverride<string[] | undefined>(
      GLOBAL_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredOrgRoles = this.reflector.getAllAndOverride<string[] | undefined>(ORG_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredLegacyRoles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No role decorators → allow (authentication check is handled by AuthGuard)
    const hasAnyRequirement =
      (requiredGlobalRoles && requiredGlobalRoles.length > 0) ||
      (requiredOrgRoles && requiredOrgRoles.length > 0) ||
      (requiredLegacyRoles && requiredLegacyRoles.length > 0);

    if (!hasAnyRequirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // Superadmin global role always passes (override)
    if (user.globalRole === 'superadmin') {
      return true;
    }

    // Check global roles first
    if (requiredGlobalRoles && requiredGlobalRoles.length > 0) {
      if (!requiredGlobalRoles.includes(user.globalRole)) {
        throw new ForbiddenException('Insufficient global permissions');
      }
      return true;
    }

    // Check org roles
    if (requiredOrgRoles && requiredOrgRoles.length > 0) {
      if (!requiredOrgRoles.includes(user.orgRole)) {
        throw new ForbiddenException('Insufficient organization permissions');
      }
      return true;
    }

    // Legacy role check (backward compatibility)
    if (requiredLegacyRoles && requiredLegacyRoles.length > 0) {
      if (!requiredLegacyRoles.includes(user.role)) {
        throw new ForbiddenException('Insufficient permissions');
      }
      return true;
    }

    return true;
  }
}
