import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JourneysController } from './journeys.controller';
import { JourneysService } from './journeys.service';

describe('JourneysController', () => {
  let controller: JourneysController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      create: vi.fn(),
      getById: vi.fn(),
      listByUser: vi.fn(),
      update: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JourneysController],
      providers: [{ provide: JourneysService, useValue: service }],
    }).compile();

    controller = module.get<JourneysController>(JourneysController);
  });

  describe('list', () => {
    it('should return journeys for the current user', async () => {
      service.listByUser.mockResolvedValue([{ id: 'j1', title: 'Journey 1' }]);

      const result = await controller.list({ userId: 'u1' });
      expect(result).toEqual({
        data: [{ id: 'j1', title: 'Journey 1' }],
      });
      expect(service.listByUser).toHaveBeenCalledWith('u1');
    });
  });

  describe('getOne', () => {
    it('should return a single journey', async () => {
      service.getById.mockResolvedValue({ id: 'j1', title: 'Test' });

      const result = await controller.getOne('j1');
      expect(result).toEqual({ data: { id: 'j1', title: 'Test' } });
    });
  });

  describe('create', () => {
    it('should create and return a journey', async () => {
      const input = {
        userId: 'u1',
        title: 'New Journey',
        description: 'desc',
        competencyAreas: ['ai'],
        metadata: {
          estimatedDurationWeeks: 8,
          difficultyProgression: 'linear',
          roleCategory: 'dev',
        },
      };
      service.create.mockResolvedValue({ id: 'j1', ...input });

      const result = await controller.create(input);
      expect(result.data).toHaveProperty('id', 'j1');
      expect(service.create).toHaveBeenCalledOnce();
    });
  });

  describe('update', () => {
    it('should update and return journey', async () => {
      service.update.mockResolvedValue({ id: 'j1', title: 'Updated' });

      const result = await controller.update('j1', { title: 'Updated' });
      expect(result).toEqual({ data: { id: 'j1', title: 'Updated' } });
      expect(service.update).toHaveBeenCalledWith('j1', { title: 'Updated' });
    });
  });
});
