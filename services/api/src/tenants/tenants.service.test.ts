import { PLAN_LIMITS } from '@aijourney/shared';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantsRepository } from './tenants.repository';
import { TenantsService } from './tenants.service';

describe('TenantsService', () => {
  let service: TenantsService;
  let repo: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    repo = {
      create: vi.fn().mockImplementation(async (t) => t),
      getById: vi.fn().mockResolvedValue(undefined),
      getBySlug: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      updatePlan: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      listAll: vi.fn().mockResolvedValue([]),
      incrementUsage: vi.fn().mockResolvedValue(undefined),
      resetUsage: vi.fn().mockResolvedValue(undefined),
      count: vi.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantsService, { provide: TenantsRepository, useValue: repo }],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
  });

  describe('create', () => {
    it('should create a free tenant with PLAN_LIMITS defaults', async () => {
      const result = await service.create({ name: 'Mito', slug: 'mito' });

      expect(result.name).toBe('Mito');
      expect(result.slug).toBe('mito');
      expect(result.plan).toBe('free');
      expect(result.quotas.maxUsers).toBe(PLAN_LIMITS.free.maxUsers);
      expect(result.quotas.maxLlmCallsPerMonth).toBe(PLAN_LIMITS.free.maxLlmCallsPerMonth);
      expect(result.quotas.additionalLlmCalls).toBe(0);
      expect(result.usage.llmCallsUsed).toBe(0);
      expect(result.id).toBeTruthy();
      expect(repo.create).toHaveBeenCalledOnce();
    });

    it('should create a pro tenant when plan specified', async () => {
      const result = await service.create({
        name: 'Pro Org',
        slug: 'pro-org',
        plan: 'pro',
      });

      expect(result.plan).toBe('pro');
      expect(result.quotas.maxUsers).toBe(PLAN_LIMITS.pro.maxUsers);
      expect(result.quotas.maxLlmCallsPerMonth).toBe(PLAN_LIMITS.pro.maxLlmCallsPerMonth);
    });

    it('should throw ConflictException if slug already taken', async () => {
      repo.getBySlug.mockResolvedValue({ id: 'existing', slug: 'taken' });

      await expect(service.create({ name: 'Dup', slug: 'taken' })).rejects.toThrow(
        ConflictException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('should return tenant when found', async () => {
      const tenant = { id: 't1', name: 'T' };
      repo.getById.mockResolvedValue(tenant);
      const result = await service.getById('t1');
      expect(result).toEqual(tenant);
    });

    it('should throw NotFoundException when not found', async () => {
      await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getBySlug', () => {
    it('should delegate to repo and return result', async () => {
      const tenant = { id: 't1', slug: 'mito' };
      repo.getBySlug.mockResolvedValue(tenant);
      const result = await service.getBySlug('mito');
      expect(result).toEqual(tenant);
    });

    it('should return undefined if not found', async () => {
      const result = await service.getBySlug('unknown');
      expect(result).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update name and return refreshed tenant', async () => {
      const updated = { id: 't1', name: 'New Name' };
      repo.getById.mockResolvedValue(updated);

      const result = await service.update('t1', { name: 'New Name' });
      expect(repo.update).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({
          name: 'New Name',
          updatedAt: expect.any(String),
        }),
      );
      expect(result).toEqual(updated);
    });

    it('should update settings', async () => {
      const updated = { id: 't1', settings: { displayName: 'X' } };
      repo.getById.mockResolvedValue(updated);

      const result = await service.update('t1', {
        settings: { displayName: 'X' },
      });
      expect(repo.update).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ settings: { displayName: 'X' } }),
      );
      expect(result).toEqual(updated);
    });
  });

  describe('updatePlan', () => {
    it('should update plan with matching PLAN_LIMITS', async () => {
      const updated = { id: 't1', plan: 'enterprise' };
      repo.getById.mockResolvedValue(updated);

      const result = await service.updatePlan('t1', 'enterprise');
      expect(repo.updatePlan).toHaveBeenCalledWith('t1', 'enterprise', {
        maxUsers: PLAN_LIMITS.enterprise.maxUsers,
        maxLlmCallsPerMonth: PLAN_LIMITS.enterprise.maxLlmCallsPerMonth,
      });
      expect(result).toEqual(updated);
    });
  });

  describe('delete', () => {
    it('should delegate to repo', async () => {
      await service.delete('t1');
      expect(repo.delete).toHaveBeenCalledWith('t1');
    });
  });

  describe('listAll', () => {
    it('should return all tenants', async () => {
      const tenants = [{ id: 't1' }, { id: 't2' }];
      repo.listAll.mockResolvedValue(tenants);
      const result = await service.listAll();
      expect(result).toEqual(tenants);
    });
  });

  describe('incrementLlmUsage', () => {
    it('should increment usage.llmCallsUsed by 1', async () => {
      await service.incrementLlmUsage('t1');
      expect(repo.incrementUsage).toHaveBeenCalledWith('t1', 'usage.llmCallsUsed', 1);
    });
  });

  describe('resetUsage', () => {
    it('should delegate to repo', async () => {
      await service.resetUsage('t1');
      expect(repo.resetUsage).toHaveBeenCalledWith('t1');
    });
  });

  describe('count', () => {
    it('should return count from repo', async () => {
      repo.count.mockResolvedValue(42);
      const result = await service.count();
      expect(result).toBe(42);
    });
  });
});
