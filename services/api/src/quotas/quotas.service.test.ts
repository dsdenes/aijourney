import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantsRepository } from '../tenants/tenants.repository';
import { QuotaService } from './quotas.service';

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    name: 'Test',
    slug: 'test',
    plan: 'pro',
    settings: {},
    quotas: {
      maxUsers: 25,
      maxLlmCallsPerMonth: 5000,
      additionalLlmCalls: 0,
      ...((overrides['quotas'] as Record<string, unknown>) || {}),
    },
    usage: {
      currentPeriodStart: '2026-01-01',
      llmCallsUsed: 0,
      lastResetAt: '2026-01-01',
      ...((overrides['usage'] as Record<string, unknown>) || {}),
    },
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

describe('QuotaService', () => {
  let service: QuotaService;
  let tenantsRepo: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    tenantsRepo = {
      getById: vi.fn().mockResolvedValue(undefined),
      incrementUsage: vi.fn().mockResolvedValue(undefined),
      resetUsage: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [QuotaService, { provide: TenantsRepository, useValue: tenantsRepo }],
    }).compile();

    service = module.get<QuotaService>(QuotaService);
  });

  describe('checkAndIncrement', () => {
    it('should allow call and increment usage when within quota', async () => {
      tenantsRepo.getById.mockResolvedValue(
        makeTenant({
          usage: {
            llmCallsUsed: 100,
            currentPeriodStart: '2026-01-01',
            lastResetAt: '2026-01-01',
          },
        }),
      );

      const result = await service.checkAndIncrement('t1', 1);
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(101);
      expect(result.remainingCalls).toBe(4899);
      expect(tenantsRepo.incrementUsage).toHaveBeenCalledWith('t1', 'llmCallsUsed', 1);
    });

    it('should throw ForbiddenException when tenant not found', async () => {
      await expect(service.checkAndIncrement('missing')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when quota fully exceeded', async () => {
      tenantsRepo.getById.mockResolvedValue(
        makeTenant({
          usage: {
            llmCallsUsed: 5000,
            currentPeriodStart: '2026-01-01',
            lastResetAt: '2026-01-01',
          },
        }),
      );

      await expect(service.checkAndIncrement('t1')).rejects.toThrow(ForbiddenException);
      expect(tenantsRepo.incrementUsage).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when remaining < requested calls', async () => {
      tenantsRepo.getById.mockResolvedValue(
        makeTenant({
          usage: {
            llmCallsUsed: 4998,
            currentPeriodStart: '2026-01-01',
            lastResetAt: '2026-01-01',
          },
        }),
      );

      await expect(service.checkAndIncrement('t1', 5)).rejects.toThrow(ForbiddenException);
    });

    it('should include additionalLlmCalls in quota calculation', async () => {
      tenantsRepo.getById.mockResolvedValue(
        makeTenant({
          quotas: {
            maxUsers: 25,
            maxLlmCallsPerMonth: 5000,
            additionalLlmCalls: 1000,
          },
          usage: {
            llmCallsUsed: 5500,
            currentPeriodStart: '2026-01-01',
            lastResetAt: '2026-01-01',
          },
        }),
      );

      const result = await service.checkAndIncrement('t1', 1);
      expect(result.allowed).toBe(true);
      expect(result.totalLimit).toBe(6000);
      expect(result.remainingCalls).toBe(499);
    });

    it('should treat enterprise unlimited plan (-1) as always allowed', async () => {
      tenantsRepo.getById.mockResolvedValue(
        makeTenant({
          plan: 'enterprise',
          quotas: {
            maxUsers: -1,
            maxLlmCallsPerMonth: -1,
            additionalLlmCalls: 0,
          },
          usage: {
            llmCallsUsed: 999999,
            currentPeriodStart: '2026-01-01',
            lastResetAt: '2026-01-01',
          },
        }),
      );

      const result = await service.checkAndIncrement('t1', 100);
      expect(result.allowed).toBe(true);
      expect(result.totalLimit).toBe(-1);
      expect(result.remainingCalls).toBeGreaterThan(0);
    });
  });

  describe('check', () => {
    it('should return quota status without incrementing', async () => {
      tenantsRepo.getById.mockResolvedValue(
        makeTenant({
          usage: {
            llmCallsUsed: 2000,
            currentPeriodStart: '2026-01-01',
            lastResetAt: '2026-01-01',
          },
        }),
      );

      const result = await service.check('t1');
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(2000);
      expect(result.remainingCalls).toBe(3000);
      expect(tenantsRepo.incrementUsage).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when tenant not found', async () => {
      await expect(service.check('missing')).rejects.toThrow(ForbiddenException);
    });

    it('should report exceeded quota', async () => {
      tenantsRepo.getById.mockResolvedValue(
        makeTenant({
          usage: {
            llmCallsUsed: 6000,
            currentPeriodStart: '2026-01-01',
            lastResetAt: '2026-01-01',
          },
        }),
      );

      const result = await service.check('t1');
      expect(result.allowed).toBe(false);
      expect(result.remainingCalls).toBe(0);
      expect(result.reason).toContain('exceeded');
    });
  });

  describe('resetMonthlyUsage', () => {
    it('should delegate to tenantsRepo.resetUsage', async () => {
      await service.resetMonthlyUsage('t1');
      expect(tenantsRepo.resetUsage).toHaveBeenCalledWith('t1');
    });
  });
});
