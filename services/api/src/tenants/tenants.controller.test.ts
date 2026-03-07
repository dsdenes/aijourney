import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

describe('TenantsController', () => {
  let controller: TenantsController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      create: vi.fn().mockResolvedValue({ id: 't1', name: 'Mito', slug: 'mito' }),
      getById: vi.fn().mockResolvedValue({ id: 't1', name: 'Mito' }),
      getBySlug: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue({ id: 't1', name: 'Updated' }),
      updatePlan: vi.fn().mockResolvedValue({ id: 't1', plan: 'pro' }),
      delete: vi.fn().mockResolvedValue(undefined),
      listAll: vi.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [{ provide: TenantsService, useValue: service }],
    }).compile();

    controller = module.get<TenantsController>(TenantsController);
  });

  describe('create', () => {
    it('should create a tenant and return in data envelope', async () => {
      const result = await controller.create({ name: 'Mito', slug: 'mito' });
      expect(result).toEqual({
        data: { id: 't1', name: 'Mito', slug: 'mito' },
      });
      expect(service.create).toHaveBeenCalledWith({
        name: 'Mito',
        slug: 'mito',
        plan: 'free',
      });
    });

    it('should pass plan from body if provided', async () => {
      await controller.create({ name: 'Pro', slug: 'pro', plan: 'pro' });
      expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ plan: 'pro' }));
    });
  });

  describe('getCurrent', () => {
    it('should return tenant for valid tenantId', async () => {
      const result = await controller.getCurrent('t1');
      expect(result).toEqual({ data: { id: 't1', name: 'Mito' } });
      expect(service.getById).toHaveBeenCalledWith('t1');
    });
  });

  describe('getById', () => {
    it('should return tenant by id', async () => {
      const result = await controller.getById('t1');
      expect(result).toEqual({ data: { id: 't1', name: 'Mito' } });
    });
  });

  describe('update', () => {
    it('should update and return tenant', async () => {
      const result = await controller.update('t1', { name: 'Updated' });
      expect(result).toEqual({ data: { id: 't1', name: 'Updated' } });
      expect(service.update).toHaveBeenCalledWith('t1', { name: 'Updated' });
    });
  });

  describe('delete', () => {
    it('should delete and return success', async () => {
      const result = await controller.delete('t1');
      expect(result).toEqual({ data: { deleted: true } });
      expect(service.delete).toHaveBeenCalledWith('t1');
    });
  });

  describe('listAll', () => {
    it('should return all tenants', async () => {
      service.listAll.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
      const result = await controller.listAll();
      expect(result).toEqual({ data: [{ id: 't1' }, { id: 't2' }] });
    });
  });
});
