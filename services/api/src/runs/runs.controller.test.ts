import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

describe('RunsController', () => {
  let controller: RunsController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      create: vi.fn(),
      getById: vi.fn(),
      listByUser: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      cancel: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RunsController],
      providers: [{ provide: RunsService, useValue: service }],
    }).compile();

    controller = module.get<RunsController>(RunsController);
  });

  describe('create', () => {
    it('should create a run request for current user', async () => {
      const input = {
        purpose: 'kb_chat',
        inputs: { promptHash: 'sha256-abc' },
      };
      service.create.mockResolvedValue({
        id: 'r1',
        status: 'APPROVED',
        ...input,
      });

      const result = await controller.create({ userId: 'u1' }, input);
      expect(result.data.id).toBe('r1');
      expect(result.data.status).toBe('APPROVED');
      expect(service.create).toHaveBeenCalledWith('u1', input);
    });
  });

  describe('list', () => {
    it('should list runs for current user', async () => {
      service.listByUser.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);

      const result = await controller.list({ userId: 'u1' });
      expect(result.data).toHaveLength(2);
      expect(service.listByUser).toHaveBeenCalledWith('u1');
    });
  });

  describe('getOne', () => {
    it('should return a single run', async () => {
      service.getById.mockResolvedValue({ id: 'r1', status: 'PENDING' });

      const result = await controller.getOne('r1');
      expect(result.data.status).toBe('PENDING');
    });
  });

  describe('approve', () => {
    it('should approve a run request as admin', async () => {
      service.approve.mockResolvedValue({ id: 'r1', status: 'APPROVED' });

      const result = await controller.approve('r1', { userId: 'admin-1' });
      expect(result.data.status).toBe('APPROVED');
      expect(service.approve).toHaveBeenCalledWith('r1', 'admin-1');
    });
  });

  describe('reject', () => {
    it('should reject a run request', async () => {
      service.reject.mockResolvedValue({ id: 'r1', status: 'REJECTED' });

      const result = await controller.reject('r1');
      expect(result.data.status).toBe('REJECTED');
    });
  });

  describe('cancel', () => {
    it('should cancel a run request', async () => {
      service.cancel.mockResolvedValue({ id: 'r1', status: 'CANCELLED' });

      const result = await controller.cancel('r1', { userId: 'u1' });
      expect(result.data.status).toBe('CANCELLED');
      expect(service.cancel).toHaveBeenCalledWith('r1', 'u1');
    });
  });
});
