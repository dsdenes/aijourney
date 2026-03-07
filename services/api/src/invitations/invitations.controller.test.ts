import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

describe('InvitationsController', () => {
  let controller: InvitationsController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      create: vi.fn().mockResolvedValue({ id: 'inv1', email: 'a@b.com' }),
      bulkInvite: vi.fn().mockResolvedValue({ created: [], skipped: [] }),
      listByTenant: vi.fn().mockResolvedValue([]),
      revoke: vi.fn().mockResolvedValue(undefined),
      getByToken: vi.fn().mockResolvedValue({
        invitation: { id: 'inv1' },
        isValid: true,
      }),
      acceptForUser: vi.fn().mockResolvedValue({ id: 'inv1', status: 'accepted' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvitationsController],
      providers: [{ provide: InvitationsService, useValue: service }],
    }).compile();

    controller = module.get<InvitationsController>(InvitationsController);
  });

  describe('create', () => {
    it('should create invitation and return in data envelope', async () => {
      const result = await controller.create(
        't1',
        { userId: 'u1' },
        {
          email: 'a@b.com',
          orgRole: 'admin',
        },
      );
      expect(result).toEqual({ data: { id: 'inv1', email: 'a@b.com' } });
      expect(service.create).toHaveBeenCalledWith('t1', 'u1', {
        email: 'a@b.com',
        orgRole: 'admin',
      });
    });

    it('should default orgRole to member when not provided', async () => {
      await controller.create('t1', { userId: 'u1' }, { email: 'x@y.com' });
      expect(service.create).toHaveBeenCalledWith('t1', 'u1', {
        email: 'x@y.com',
        orgRole: 'member',
      });
    });
  });

  describe('bulkInvite', () => {
    it('should delegate bulk invite', async () => {
      service.bulkInvite.mockResolvedValue({
        created: [{ id: 'inv1' }],
        skipped: ['dup@b.com'],
      });
      const result = await controller.bulkInvite(
        't1',
        { userId: 'u1' },
        {
          emails: ['a@b.com', 'dup@b.com'],
          orgRole: 'member',
        },
      );
      expect(result).toEqual({
        data: { created: [{ id: 'inv1' }], skipped: ['dup@b.com'] },
      });
      expect(service.bulkInvite).toHaveBeenCalledWith(
        't1',
        'u1',
        ['a@b.com', 'dup@b.com'],
        'member',
      );
    });
  });

  describe('list', () => {
    it('should return tenant invitations', async () => {
      service.listByTenant.mockResolvedValue([{ id: 'inv1' }, { id: 'inv2' }]);
      const result = await controller.list('t1');
      expect(result).toEqual({ data: [{ id: 'inv1' }, { id: 'inv2' }] });
    });
  });

  describe('revoke', () => {
    it('should revoke and return success', async () => {
      const result = await controller.revoke('inv1', 't1');
      expect(result).toEqual({ data: { revoked: true } });
      expect(service.revoke).toHaveBeenCalledWith('inv1', 't1');
    });
  });

  describe('preview', () => {
    it('should return invitation preview', async () => {
      const result = await controller.preview('tok123');
      expect(result).toEqual({
        data: { invitation: { id: 'inv1' }, isValid: true },
      });
      expect(service.getByToken).toHaveBeenCalledWith('tok123');
    });
  });

  describe('accept', () => {
    it('should accept valid invitation', async () => {
      const result = await controller.accept('tok123', { userId: 'u1' });
      expect(result).toEqual({ data: { id: 'inv1', status: 'accepted' } });
      expect(service.acceptForUser).toHaveBeenCalledWith('inv1', 'u1');
    });

    it('should return error for invalid invitation', async () => {
      service.getByToken.mockResolvedValue({
        invitation: { id: 'inv1' },
        isValid: false,
        reason: 'Invitation has expired',
      });
      const result = await controller.accept('tok123', { userId: 'u1' });
      expect(result).toEqual({
        error: {
          code: 'INVALID_INVITATION',
          message: 'Invitation has expired',
        },
      });
      expect(service.acceptForUser).not.toHaveBeenCalled();
    });
  });
});
