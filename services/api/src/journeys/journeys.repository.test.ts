import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MONGODB_DB } from '../mongodb/mongodb.module';
import { JourneysRepository } from './journeys.repository';

describe('JourneysRepository', () => {
  let repo: JourneysRepository;
  let mockCollection: Record<string, ReturnType<typeof vi.fn>>;
  let mockDb: { collection: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockCollection = {
      insertOne: vi.fn().mockResolvedValue({}),
      findOne: vi.fn().mockResolvedValue(null),
      updateOne: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
    };
    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [JourneysRepository, { provide: MONGODB_DB, useValue: mockDb }],
    }).compile();

    repo = module.get<JourneysRepository>(JourneysRepository);
  });

  describe('create', () => {
    it('should insert a journey document', async () => {
      const journey = {
        id: 'j1',
        userId: 'u1',
        title: 'Test Journey',
      };

      const result = await repo.create(journey as any);
      expect(result).toEqual(journey);

      const doc = mockCollection.insertOne.mock.calls[0]![0];
      expect(doc._id).toBe('j1');
    });
  });

  describe('getById', () => {
    it('should return journey when found', async () => {
      mockCollection.findOne.mockResolvedValue({
        _id: 'j1',
        title: 'Test',
      });

      const result = await repo.getById('j1');
      expect(result).toEqual({ id: 'j1', title: 'Test' });
    });

    it('should return undefined when not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await repo.getById('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('listByUser', () => {
    it('should find by userId sorted by createdAt desc', async () => {
      const mockSort = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { _id: 'j1', userId: 'u1' },
          { _id: 'j2', userId: 'u1' },
        ]),
      });
      mockCollection.find.mockReturnValue({ sort: mockSort });

      const result = await repo.listByUser('u1');
      expect(result).toHaveLength(2);
      expect(mockCollection.find).toHaveBeenCalledWith({ userId: 'u1' });
      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
    });
  });

  describe('update', () => {
    it('should call updateOne with $set', async () => {
      await repo.update('j1', { title: 'Updated Title' });

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: 'j1' },
        { $set: { title: 'Updated Title' } },
      );
    });

    it('should skip when no fields', async () => {
      await repo.update('j1', {});
      expect(mockCollection.updateOne).not.toHaveBeenCalled();
    });
  });
});
