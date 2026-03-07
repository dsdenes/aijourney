import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserTenantMembershipsService } from './user-tenant-memberships.service';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let membershipsService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    repo = {
      create: vi.fn(),
      getById: vi.fn(),
      getByEmail: vi.fn(),
      update: vi.fn(),
      listAll: vi.fn(),
      listByTenant: vi.fn().mockResolvedValue([]),
      countAll: vi.fn().mockResolvedValue(0),
      getByIds: vi.fn().mockResolvedValue([]),
    };
    membershipsService = {
      ensureMembership: vi.fn().mockResolvedValue({}),
      listByTenant: vi.fn().mockResolvedValue([]),
      listByUser: vi.fn().mockResolvedValue([]),
      getByUserAndTenant: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repo },
        { provide: UserTenantMembershipsService, useValue: membershipsService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('create', () => {
    it('should create a user with generated ID and timestamps', async () => {
      repo.create.mockImplementation((user: unknown) => Promise.resolve(user));

      const result = await service.create({
        googleId: 'g123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'employee',
        tenantId: 't1',
        orgRole: 'member',
      });

      expect(result.id).toBeDefined();
      expect(result.id).toHaveLength(26); // ULID
      expect(result.email).toBe('test@example.com');
      expect(result.name).toBe('Test User');
      expect(result.role).toBe('employee');
      expect(result.onboardingComplete).toBe(false);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(result.lastLoginAt).toBeDefined();
      expect(repo.create).toHaveBeenCalledOnce();
      expect(membershipsService.ensureMembership).toHaveBeenCalledWith(result.id, 't1', 'member');
    });

    it('should default role to employee when not provided', async () => {
      repo.create.mockImplementation((user: unknown) => Promise.resolve(user));

      const result = await service.create({
        googleId: 'g123',
        email: 'test@example.com',
        name: 'Test User',
        tenantId: 't1',
      });

      expect(result.role).toBe('employee');
    });
  });

  describe('getById', () => {
    it('should return user when found', async () => {
      const user = { id: 'u1', email: 'test@example.com' };
      repo.getById.mockResolvedValue(user);

      const result = await service.getById('u1');
      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when not found', async () => {
      repo.getById.mockResolvedValue(undefined);

      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getByEmail', () => {
    it('should return user when found', async () => {
      const user = { id: 'u1', email: 'test@example.com' };
      repo.getByEmail.mockResolvedValue(user);

      const result = await service.getByEmail('test@example.com');
      expect(result).toEqual(user);
    });

    it('should return undefined when not found', async () => {
      repo.getByEmail.mockResolvedValue(undefined);

      const result = await service.getByEmail('nobody@example.com');
      expect(result).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update user and return updated result', async () => {
      const updatedUser = {
        id: 'u1',
        email: 'test@example.com',
        name: 'New Name',
      };
      repo.update.mockResolvedValue(undefined);
      repo.getById.mockResolvedValue(updatedUser);

      const result = await service.update('u1', { name: 'New Name' });

      expect(result.name).toBe('New Name');
      expect(repo.update).toHaveBeenCalledOnce();
      // Should include updatedAt in the update call
      const updateArgs = repo.update.mock.calls[0]!;
      expect(updateArgs[1]).toHaveProperty('updatedAt');
    });
  });

  describe('listAll', () => {
    it('should return all users', async () => {
      repo.listAll.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);

      const result = await service.listAll();
      expect(result).toHaveLength(2);
    });
  });

  describe('assignTenantMembership', () => {
    it('should activate the assigned tenant when requested', async () => {
      repo.getById.mockResolvedValue({ id: 'u1', tenantId: 't-old', orgRole: 'member' });
      membershipsService.ensureMembership.mockResolvedValue({ orgRole: 'owner' });

      await service.assignTenantMembership('u1', 't1', 'owner', { makeActive: true });

      expect(repo.update).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ tenantId: 't1', orgRole: 'owner' }),
      );
    });
  });
});
