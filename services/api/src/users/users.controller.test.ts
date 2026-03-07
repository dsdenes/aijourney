import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      create: vi.fn(),
      getById: vi.fn(),
      getByEmail: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  describe('list', () => {
    it('should return wrapped user list', async () => {
      service.listByTenant.mockResolvedValue([
        { id: 'u1', name: 'Alice' },
        { id: 'u2', name: 'Bob' },
      ]);

      const result = await controller.list('tenant-1');
      expect(result).toEqual({
        data: [
          { id: 'u1', name: 'Alice' },
          { id: 'u2', name: 'Bob' },
        ],
      });
      expect(service.listByTenant).toHaveBeenCalledWith('tenant-1');
    });
  });

  describe('getOne', () => {
    it('should return wrapped user', async () => {
      service.getById.mockResolvedValue({ id: 'u1', name: 'Alice', tenantId: 'tenant-1' });

      const result = await controller.getOne('u1', {
        userId: 'u1',
        tenantId: 'tenant-1',
        globalRole: 'user',
      });
      expect(result).toEqual({ data: { id: 'u1', name: 'Alice', tenantId: 'tenant-1' } });
      expect(service.getById).toHaveBeenCalledWith('u1');
    });
  });

  describe('update', () => {
    it('should call service.update and return result', async () => {
      service.getById.mockResolvedValue({
        id: 'u1',
        tenantId: 'tenant-1',
        globalRole: 'user',
      });
      service.update.mockResolvedValue({
        id: 'u1',
        name: 'Updated Name',
      });

      const result = await controller.update(
        'u1',
        {
          userId: 'u1',
          tenantId: 'tenant-1',
          globalRole: 'user',
          orgRole: 'member',
        },
        { name: 'Updated Name' },
      );
      expect(result).toEqual({
        data: { id: 'u1', name: 'Updated Name' },
      });
      expect(service.update).toHaveBeenCalledWith('u1', {
        name: 'Updated Name',
      });
    });
  });
});
