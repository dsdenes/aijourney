import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TenantsRepository } from '../../tenants/tenants.repository';
import { UsersRepository } from '../../users/users.repository';

export interface RequestWithTenant extends Request {
  tenantId?: string;
  orgRole?: string;
  globalRole?: string;
}

/**
 * Middleware that extracts tenant context from the authenticated user
 * and attaches it to the request for downstream use.
 *
 * Must run AFTER Passport auth guard populates req.user.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(UsersRepository)
    private readonly usersRepo: UsersRepository,
    @Inject(TenantsRepository)
    private readonly tenantsRepo: TenantsRepository,
  ) {}

  async use(req: RequestWithTenant, _res: Response, next: NextFunction) {
    const user = (req as unknown as Record<string, unknown>).user as
      | { userId: string; email: string; globalRole?: string }
      | undefined;
    const requestedTenantId = req.header?.('x-tenant-id');

    if (user?.email) {
      try {
        const dbUser = await this.usersRepo.getByEmail(user.email);
        if (dbUser) {
          let tenantId = dbUser.tenantId;

          if (dbUser.globalRole === 'superadmin' && requestedTenantId) {
            const requestedTenant = await this.tenantsRepo.getById(requestedTenantId);
            if (requestedTenant) {
              tenantId = requestedTenant.id;
            }
          }

          req.tenantId = tenantId;
          req.orgRole = dbUser.orgRole;
          req.globalRole = dbUser.globalRole;
        }
      } catch {
        // User might not exist yet — tenant context will be empty
      }
    }

    next();
  }
}
