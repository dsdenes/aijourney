import { PLAN_LIMITS } from '@aijourney/shared';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRunsRepository } from '../agent-runs/agent-runs.repository';
import { JourneysRepository } from '../journeys/journeys.repository';
import { MemoryRepository } from '../memory/memory.repository';
import { RunsRepository } from '../runs/runs.repository';
import { TenantsRepository } from '../tenants/tenants.repository';
import { UsersService } from '../users/users.service';
import { SuperAdminService } from './superadmin.service';

function makeTenant(id: string, plan: string, llmUsed: number) {
  return {
    id,
    name: `Tenant ${id}`,
    slug: id,
    plan,
    settings: {},
    quotas: {
      maxUsers: 25,
      maxLlmCallsPerMonth: plan === 'enterprise' ? -1 : 5000,
      additionalLlmCalls: 0,
    },
    usage: {
      currentPeriodStart: '2026-01-01',
      llmCallsUsed: llmUsed,
      lastResetAt: '2026-01-01',
    },
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
}

describe('SuperAdminService', () => {
  let service: SuperAdminService;
  let tenantsRepo: Record<string, ReturnType<typeof vi.fn>>;
  let usersService: Record<string, ReturnType<typeof vi.fn>>;
  let journeysRepo: Record<string, ReturnType<typeof vi.fn>>;
  let runsRepo: Record<string, ReturnType<typeof vi.fn>>;
  let agentRunsRepo: Record<string, ReturnType<typeof vi.fn>>;
  let memoryRepo: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    tenantsRepo = {
      listAll: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(undefined),
      updatePlan: vi.fn().mockResolvedValue(undefined),
    };
    usersService = {
      countAll: vi.fn().mockResolvedValue(0),
      countByTenant: vi.fn().mockResolvedValue(0),
      listByTenant: vi.fn().mockResolvedValue([]),
      listAll: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue({
        id: 'u1',
        email: 'u1@example.com',
      }),
      update: vi.fn().mockResolvedValue({}),
    };
    journeysRepo = {
      listByTenant: vi.fn().mockResolvedValue([]),
    };
    runsRepo = {};
    agentRunsRepo = {};
    memoryRepo = {
      tenantFactCount: vi.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperAdminService,
        { provide: TenantsRepository, useValue: tenantsRepo },
        { provide: UsersService, useValue: usersService },
        { provide: JourneysRepository, useValue: journeysRepo },
        { provide: RunsRepository, useValue: runsRepo },
        { provide: AgentRunsRepository, useValue: agentRunsRepo },
        { provide: MemoryRepository, useValue: memoryRepo },
      ],
    }).compile();

    service = module.get<SuperAdminService>(SuperAdminService);
  });

  describe('getPlatformStats', () => {
    it('should aggregate stats across all tenants', async () => {
      tenantsRepo.listAll.mockResolvedValue([
        makeTenant('t1', 'free', 50),
        makeTenant('t2', 'pro', 200),
        makeTenant('t3', 'enterprise', 1000),
        makeTenant('t4', 'free', 30),
      ]);
      usersService.countAll.mockResolvedValue(12);

      const result = await service.getPlatformStats();
      expect(result.totalTenants).toBe(4);
      expect(result.totalUsers).toBe(12);
      expect(result.totalLlmCalls).toBe(1280);
      expect(result.tenantBreakdown).toEqual({
        free: 2,
        pro: 1,
        enterprise: 1,
      });
    });

    it('should return zeroes for empty platform', async () => {
      const result = await service.getPlatformStats();
      expect(result.totalTenants).toBe(0);
      expect(result.totalUsers).toBe(0);
      expect(result.totalLlmCalls).toBe(0);
    });
  });

  describe('listAllTenants', () => {
    it('should return tenant details with user counts', async () => {
      tenantsRepo.listAll.mockResolvedValue([makeTenant('t1', 'pro', 500)]);
      usersService.countByTenant.mockResolvedValue(5);

      const result = await service.listAllTenants();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 't1',
        plan: 'pro',
        userCount: 5,
        llmCallsUsed: 500,
        llmCallsLimit: 5000, // maxLlmCallsPerMonth + additionalLlmCalls
      });
    });

    it('should handle enterprise unlimited (-1) limit', async () => {
      tenantsRepo.listAll.mockResolvedValue([makeTenant('t1', 'enterprise', 9999)]);
      usersService.countByTenant.mockResolvedValue(100);

      const result = await service.listAllTenants();
      expect(result[0]?.llmCallsLimit).toBe(-1);
    });
  });

  describe('getTenantDashboard', () => {
    it('should return full dashboard for existing tenant', async () => {
      const tenant = makeTenant('t1', 'pro', 500);
      tenantsRepo.getById.mockResolvedValue(tenant);
      usersService.countByTenant.mockResolvedValue(3);
      usersService.listByTenant.mockResolvedValue([
        {
          id: 'u1',
          email: 'a@b.com',
          name: 'Alice',
          orgRole: 'admin',
          globalRole: 'user',
          lastLoginAt: '2026-01-15',
        },
      ]);
      journeysRepo.listByTenant.mockResolvedValue([{ id: 'j1' }, { id: 'j2' }]);
      memoryRepo.tenantFactCount.mockResolvedValue(42);

      const result = await service.getTenantDashboard('t1');
      expect(result).not.toBeNull();
      expect(result!.tenant).toEqual(tenant);
      expect(result!.userCount).toBe(3);
      expect(result!.users).toHaveLength(1);
      expect(result!.users[0]).toMatchObject({
        id: 'u1',
        email: 'a@b.com',
        orgRole: 'admin',
      });
      expect(result!.journeyCount).toBe(2);
      expect(result!.memoryFactCount).toBe(42);
    });

    it('should return null for non-existent tenant', async () => {
      const result = await service.getTenantDashboard('missing');
      expect(result).toBeNull();
    });
  });

  describe('updateTenantPlan', () => {
    it('should update plan with correct PLAN_LIMITS', async () => {
      await service.updateTenantPlan('t1', 'enterprise');
      expect(tenantsRepo.updatePlan).toHaveBeenCalledWith('t1', 'enterprise', {
        maxUsers: PLAN_LIMITS.enterprise.maxUsers,
        maxLlmCallsPerMonth: PLAN_LIMITS.enterprise.maxLlmCallsPerMonth,
      });
    });

    it('should downgrade to free', async () => {
      await service.updateTenantPlan('t1', 'free');
      expect(tenantsRepo.updatePlan).toHaveBeenCalledWith('t1', 'free', {
        maxUsers: PLAN_LIMITS.free.maxUsers,
        maxLlmCallsPerMonth: PLAN_LIMITS.free.maxLlmCallsPerMonth,
      });
    });
  });

  describe('promoteToSuperadmin', () => {
    it('should update user globalRole to superadmin', async () => {
      await service.promoteToSuperadmin('u1');
      expect(usersService.update).toHaveBeenCalledWith('u1', {
        globalRole: 'superadmin',
      });
    });
  });

  describe('demoteFromSuperadmin', () => {
    it('should update user globalRole to user', async () => {
      usersService.getById.mockResolvedValue({ id: 'u1', email: 'other@example.com' });
      await service.demoteFromSuperadmin('u1');
      expect(usersService.update).toHaveBeenCalledWith('u1', {
        globalRole: 'user',
      });
    });

    it('should keep the protected superadmin account', async () => {
      usersService.getById.mockResolvedValue({ id: 'u1', email: 'dsdenes@gmail.com' });

      await expect(service.demoteFromSuperadmin('u1')).rejects.toThrow('protected');
    });
  });
});
