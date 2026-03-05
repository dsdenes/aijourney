import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SuperAdminController } from './superadmin.controller';
import { SuperAdminService } from './superadmin.service';

describe('SuperAdminController', () => {
  let controller: SuperAdminController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      getPlatformStats: vi.fn().mockResolvedValue({
        totalTenants: 5,
        totalUsers: 20,
        totalLlmCalls: 5000,
        tenantBreakdown: { free: 3, pro: 1, enterprise: 1 },
      }),
      listAllTenants: vi.fn().mockResolvedValue([]),
      getTenantDashboard: vi.fn().mockResolvedValue(null),
      updateTenantPlan: vi.fn().mockResolvedValue(undefined),
      promoteToSuperadmin: vi.fn().mockResolvedValue(undefined),
      demoteFromSuperadmin: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuperAdminController],
      providers: [{ provide: SuperAdminService, useValue: service }],
    }).compile();

    controller = module.get<SuperAdminController>(SuperAdminController);
  });

  describe('getPlatformStats', () => {
    it('should return stats in data envelope', async () => {
      const result = await controller.getPlatformStats();
      expect(result).toEqual({
        data: {
          totalTenants: 5,
          totalUsers: 20,
          totalLlmCalls: 5000,
          tenantBreakdown: { free: 3, pro: 1, enterprise: 1 },
        },
      });
    });
  });

  describe('listTenants', () => {
    it('should return tenants list', async () => {
      service.listAllTenants.mockResolvedValue([{ id: 't1' }]);
      const result = await controller.listTenants();
      expect(result).toEqual({ data: [{ id: 't1' }] });
    });
  });

  describe('getTenantDashboard', () => {
    it('should return dashboard data', async () => {
      const dashboard = { tenant: { id: 't1' }, userCount: 3 };
      service.getTenantDashboard.mockResolvedValue(dashboard);
      const result = await controller.getTenantDashboard('t1');
      expect(result).toEqual({ data: dashboard });
    });

    it('should return null for non-existent tenant', async () => {
      const result = await controller.getTenantDashboard('missing');
      expect(result).toEqual({ data: null });
    });
  });

  describe('updatePlan', () => {
    it('should update plan and return success', async () => {
      const result = await controller.updatePlan('t1', { plan: 'enterprise' });
      expect(result).toEqual({ data: { message: 'Plan updated' } });
      expect(service.updateTenantPlan).toHaveBeenCalledWith('t1', 'enterprise');
    });
  });

  describe('promoteUser', () => {
    it('should promote user and return success', async () => {
      const result = await controller.promoteUser('u1');
      expect(result).toEqual({
        data: { message: 'User promoted to superadmin' },
      });
      expect(service.promoteToSuperadmin).toHaveBeenCalledWith('u1');
    });
  });

  describe('demoteUser', () => {
    it('should demote user and return success', async () => {
      const result = await controller.demoteUser('u1');
      expect(result).toEqual({
        data: { message: 'User demoted from superadmin' },
      });
      expect(service.demoteFromSuperadmin).toHaveBeenCalledWith('u1');
    });
  });
});
