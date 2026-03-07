import type { OrgRole, User, UserTenantMembership } from '@aijourney/shared';
import { generateId, nowISO } from '@aijourney/shared';
import { Inject, Injectable } from '@nestjs/common';
import { UserTenantMembershipsRepository } from './user-tenant-memberships.repository';

@Injectable()
export class UserTenantMembershipsService {
  constructor(
    @Inject(UserTenantMembershipsRepository)
    private readonly repo: UserTenantMembershipsRepository,
  ) {}

  async ensureMembership(
    userId: string,
    tenantId: string,
    orgRole: OrgRole,
  ): Promise<UserTenantMembership> {
    const existing = await this.repo.getByUserAndTenant(userId, tenantId);
    if (existing) {
      if (existing.orgRole !== orgRole) {
        await this.repo.updateRole(userId, tenantId, orgRole);
        return {
          ...existing,
          orgRole,
          updatedAt: nowISO(),
        };
      }
      return existing;
    }

    const now = nowISO();
    return this.repo.create({
      id: generateId(),
      userId,
      tenantId,
      orgRole,
      createdAt: now,
      updatedAt: now,
    });
  }

  async listByUser(userId: string, legacyUser?: User): Promise<UserTenantMembership[]> {
    const memberships = await this.repo.listByUser(userId);
    if (memberships.length > 0) {
      return memberships;
    }

    if (legacyUser?.tenantId) {
      return [
        {
          id: `${legacyUser.id}:${legacyUser.tenantId}`,
          userId: legacyUser.id,
          tenantId: legacyUser.tenantId,
          orgRole: legacyUser.orgRole,
          createdAt: legacyUser.createdAt,
          updatedAt: legacyUser.updatedAt,
        },
      ];
    }

    return [];
  }

  async listByTenant(tenantId: string): Promise<UserTenantMembership[]> {
    return this.repo.listByTenant(tenantId);
  }

  async countByTenant(tenantId: string): Promise<number> {
    return this.repo.countByTenant(tenantId);
  }

  async getByUserAndTenant(
    userId: string,
    tenantId: string,
    legacyUser?: User,
  ): Promise<UserTenantMembership | undefined> {
    const membership = await this.repo.getByUserAndTenant(userId, tenantId);
    if (membership) {
      return membership;
    }

    if (legacyUser?.tenantId === tenantId) {
      return {
        id: `${legacyUser.id}:${legacyUser.tenantId}`,
        userId: legacyUser.id,
        tenantId,
        orgRole: legacyUser.orgRole,
        createdAt: legacyUser.createdAt,
        updatedAt: legacyUser.updatedAt,
      };
    }

    return undefined;
  }
}
