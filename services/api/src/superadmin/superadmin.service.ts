import type { TenantPlan } from '@aijourney/shared';
import { PLAN_LIMITS } from '@aijourney/shared';
import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { AgentRunsRepository } from '../agent-runs/agent-runs.repository';
import { JourneysRepository } from '../journeys/journeys.repository';
import { MemoryRepository } from '../memory/memory.repository';
import { RunsRepository } from '../runs/runs.repository';
import { TenantsRepository } from '../tenants/tenants.repository';
import { UsersService } from '../users/users.service';

export interface PlatformStats {
  totalTenants: number;
  totalUsers: number;
  totalLlmCalls: number;
  tenantBreakdown: {
    free: number;
    pro: number;
    enterprise: number;
  };
}

export interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  plan: string;
  userCount: number;
  llmCallsUsed: number;
  llmCallsLimit: number;
  createdAt: string;
}

/** Email that is a permanent superadmin — cannot be demoted */
const PROTECTED_SUPERADMIN = 'dsdenes@gmail.com';

@Injectable()
export class SuperAdminService {
  private readonly logger = new Logger(SuperAdminService.name);

  constructor(
    @Inject(TenantsRepository) private readonly tenantsRepo: TenantsRepository,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(JourneysRepository) private readonly journeysRepo: JourneysRepository,
    @Inject(RunsRepository) private readonly runsRepo: RunsRepository,
    @Inject(AgentRunsRepository) private readonly agentRunsRepo: AgentRunsRepository,
    @Inject(MemoryRepository) private readonly memoryRepo: MemoryRepository,
  ) {}

  async getPlatformStats(): Promise<PlatformStats> {
    const tenants = await this.tenantsRepo.listAll();
    const totalUsers = await this.usersService.countAll();
    const totalLlmCalls = tenants.reduce((sum, t) => sum + t.usage.llmCallsUsed, 0);

    const tenantBreakdown = { free: 0, pro: 0, enterprise: 0 };
    for (const t of tenants) {
      if (t.plan in tenantBreakdown) {
        tenantBreakdown[t.plan as keyof typeof tenantBreakdown]++;
      }
    }

    return {
      totalTenants: tenants.length,
      totalUsers,
      totalLlmCalls,
      tenantBreakdown,
    };
  }

  async listAllTenants(): Promise<TenantDetail[]> {
    const tenants = await this.tenantsRepo.listAll();

    const details: TenantDetail[] = [];
    for (const t of tenants) {
      const userCount = await this.usersService.countByTenant(t.id);
      details.push({
        id: t.id,
        name: t.name,
        slug: t.slug,
        plan: t.plan,
        userCount,
        llmCallsUsed: t.usage.llmCallsUsed,
        llmCallsLimit:
          t.quotas.maxLlmCallsPerMonth === -1
            ? -1
            : t.quotas.maxLlmCallsPerMonth + t.quotas.additionalLlmCalls,
        createdAt: t.createdAt,
      });
    }

    return details;
  }

  async getTenantDashboard(tenantId: string) {
    const tenant = await this.tenantsRepo.getById(tenantId);
    if (!tenant) return null;

    const [userCount, users, journeys, memoryFacts] = await Promise.all([
      this.usersService.countByTenant(tenantId),
      this.usersService.listByTenant(tenantId),
      this.journeysRepo.listByTenant(tenantId, 50),
      this.memoryRepo.tenantFactCount(tenantId),
    ]);

    return {
      tenant,
      userCount,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        orgRole: u.orgRole,
        globalRole: u.globalRole,
        lastLoginAt: u.lastLoginAt,
      })),
      journeyCount: journeys.length,
      memoryFactCount: memoryFacts,
    };
  }

  async updateTenantPlan(tenantId: string, plan: 'free' | 'pro' | 'enterprise'): Promise<void> {
    const limits = PLAN_LIMITS[plan];
    await this.tenantsRepo.updatePlan(tenantId, plan, {
      maxUsers: limits.maxUsers,
      maxLlmCallsPerMonth: limits.maxLlmCallsPerMonth,
    });
    this.logger.log(`Super-admin changed tenant ${tenantId} plan to ${plan}`);
  }

  async listAllUsers() {
    const allUsers = await this.usersService.listAll();
    const tenants = await this.tenantsRepo.listAll();
    const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

    return allUsers.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      globalRole: u.globalRole ?? 'user',
      orgRole: u.orgRole ?? 'member',
      tenantId: u.tenantId ?? '',
      tenantName: tenantMap.get(u.tenantId) ?? '',
      lastLoginAt: u.lastLoginAt,
    }));
  }

  async promoteToSuperadmin(userId: string): Promise<void> {
    await this.usersService.update(userId, { globalRole: 'superadmin' });
    this.logger.log(`User ${userId} promoted to superadmin`);
  }

  async demoteFromSuperadmin(userId: string): Promise<void> {
    const user = await this.usersService.getById(userId);
    if (user.email.toLowerCase() === PROTECTED_SUPERADMIN) {
      throw new ForbiddenException('Cannot revoke superadmin from the protected account');
    }
    await this.usersService.update(userId, { globalRole: 'user' });
    this.logger.log(`User ${userId} demoted from superadmin`);
  }

  async switchTenant(
    userId: string,
    tenantId: string,
  ): Promise<{ tenantId: string; tenantName: string }> {
    const tenant = await this.tenantsRepo.getById(tenantId);
    if (!tenant) throw new ForbiddenException('Tenant not found');
    await this.usersService.update(userId, { tenantId });
    return { tenantId: tenant.id, tenantName: tenant.name };
  }
}
