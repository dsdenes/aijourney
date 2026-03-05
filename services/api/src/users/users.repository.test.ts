import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MONGODB_DB } from '../mongodb/mongodb.module';
import { UsersRepository } from './users.repository';

describe('UsersRepository', () => {
  let repo: UsersRepository;
  let mockCollection: Record<string, ReturnType<typeof vi.fn>>;
  let mockDb: { collection: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockCollection = {
      insertOne: vi.fn().mockResolvedValue({}),
      findOne: vi.fn().mockResolvedValue(null),
      updateOne: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
    };
    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersRepository, { provide: MONGODB_DB, useValue: mockDb }],
    }).compile();

    repo = module.get<UsersRepository>(UsersRepository);
  });

  describe('create', () => {
    it('should insert a document and return the user', async () => {
      const user = {
        id: 'u1',
        email: 'test@example.com',
        name: 'Test',
        googleId: 'g1',
        role: 'employee' as const,
        onboardingComplete: false,
        preferences: {},
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        lastLoginAt: '2025-01-01T00:00:00Z',
      };

      const result = await repo.create(user);

      expect(result).toEqual(user);
      expect(mockCollection.insertOne).toHaveBeenCalledOnce();
      const doc = mockCollection.insertOne.mock.calls[0]![0];
      expect(doc._id).toBe('u1');
      expect(doc.email).toBe('test@example.com');
    });
  });

  describe('getById', () => {
    it('should return user when found', async () => {
      mockCollection.findOne.mockResolvedValue({
        _id: 'u1',
        email: 'test@example.com',
      });

      const result = await repo.getById('u1');
      expect(result).toEqual({ id: 'u1', email: 'test@example.com' });
    });

    it('should return undefined when not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await repo.getById('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('getByEmail', () => {
    it('should query by email field', async () => {
      mockCollection.findOne.mockResolvedValue({
        _id: 'u1',
        email: 'test@example.com',
      });

      const result = await repo.getByEmail('test@example.com');
      expect(result).toEqual({ id: 'u1', email: 'test@example.com' });
      expect(mockCollection.findOne).toHaveBeenCalledWith({
        email: 'test@example.com',
      });
    });

    it('should return undefined when no match', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await repo.getByEmail('nobody@example.com');
      expect(result).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should call updateOne with $set', async () => {
      await repo.update('u1', {
        name: 'New Name',
        department: 'Engineering',
      });

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: 'u1' },
        { $set: { name: 'New Name', department: 'Engineering' } },
      );
    });

    it('should skip if no fields to update', async () => {
      await repo.update('u1', {});
      expect(mockCollection.updateOne).not.toHaveBeenCalled();
    });

    it('should filter out id from updates', async () => {
      await repo.update('u1', { id: 'u1', name: 'X' } as any);

      expect(mockCollection.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { name: 'X' } });
    });
  });

  describe('listAll', () => {
    it('should find with limit', async () => {
      const mockLimit = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { _id: 'u1', email: 'a@example.com' },
          { _id: 'u2', email: 'b@example.com' },
        ]),
      });
      mockCollection.find.mockReturnValue({ limit: mockLimit });

      const result = await repo.listAll();
      expect(result).toHaveLength(2);
      expect(mockLimit).toHaveBeenCalledWith(50);
    });
  });
});
