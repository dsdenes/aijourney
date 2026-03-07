import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from '../common/email/email.service';
import { TenantsService } from '../tenants/tenants.service';
import { InvitationsRepository } from './invitations.repository';
import { InvitationsService } from './invitations.service';

describe('InvitationsService', () => {
  let service: InvitationsService;
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let tenantsService: Record<string, ReturnType<typeof vi.fn>>;
  let emailService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    repo = {
      create: vi.fn().mockImplementation(async (inv) => inv),
      getById: vi.fn().mockResolvedValue(undefined),
      getByToken: vi.fn().mockResolvedValue(undefined),
      getByEmail: vi.fn().mockResolvedValue([]),
      getByTenant: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      deleteExpired: vi.fn().mockResolvedValue(0),
      countPendingByTenant: vi.fn().mockResolvedValue(0),
      getByEmailAndTenant: vi.fn().mockResolvedValue(undefined),
    };
    tenantsService = {
      getById: vi.fn().mockResolvedValue({ id: 't1', name: 'Tenant One' }),
    };
    emailService = {
      sendInvitationEmail: vi.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: InvitationsRepository, useValue: repo },
        { provide: TenantsService, useValue: tenantsService },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<InvitationsService>(InvitationsService);
  });

  describe('create', () => {
    it('should create an invitation with pending status and token', async () => {
      const result = await service.create('t1', 'u1', {
        email: 'TEST@example.com',
        orgRole: 'admin',
      });

      expect(result.email).toBe('test@example.com'); // lowercased
      expect(result.tenantId).toBe('t1');
      expect(result.invitedBy).toBe('u1');
      expect(result.orgRole).toBe('admin');
      expect(result.status).toBe('pending');
      expect(result.token).toHaveLength(64); // 32 bytes hex
      expect(result.id).toBeTruthy();
      expect(result.expiresAt).toBeTruthy();
      expect(repo.create).toHaveBeenCalledOnce();
      expect(emailService.sendInvitationEmail).toHaveBeenCalledWith({
        email: 'test@example.com',
        tenantName: 'Tenant One',
        orgRole: 'admin',
      });
    });

    it('should default orgRole to member', async () => {
      const result = await service.create('t1', 'u1', { email: 'a@b.com' });
      expect(result.orgRole).toBe('member');
    });

    it('should throw ConflictException if pending invitation already exists', async () => {
      repo.getByEmailAndTenant.mockResolvedValue({ id: 'existing' });

      await expect(service.create('t1', 'u1', { email: 'a@b.com' })).rejects.toThrow(
        ConflictException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('should set expiry ~7 days in the future', async () => {
      const result = await service.create('t1', 'u1', { email: 'a@b.com' });
      const expiresAt = new Date(result.expiresAt).getTime();
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      expect(expiresAt - now).toBeGreaterThan(sevenDays - 60000); // within 1 minute tolerance
      expect(expiresAt - now).toBeLessThanOrEqual(sevenDays + 1000);
    });
  });

  describe('bulkInvite', () => {
    it('should create invitations for all emails', async () => {
      const result = await service.bulkInvite('t1', 'u1', ['a@b.com', 'c@d.com'], 'member');
      expect(result.created).toHaveLength(2);
      expect(result.skipped).toHaveLength(0);
    });

    it('should skip emails that throw (e.g., duplicates)', async () => {
      // First call succeeds, second one finds duplicate
      repo.getByEmailAndTenant
        .mockResolvedValueOnce(undefined) // first email — no conflict
        .mockResolvedValueOnce({ id: 'existing' }); // second email — conflict

      const result = await service.bulkInvite('t1', 'u1', ['a@b.com', 'dup@b.com'], 'admin');
      expect(result.created).toHaveLength(1);
      expect(result.skipped).toEqual(['dup@b.com']);
    });
  });

  describe('listByTenant', () => {
    it('should delegate to repo', async () => {
      const invitations = [{ id: 'inv1' }];
      repo.getByTenant.mockResolvedValue(invitations);
      const result = await service.listByTenant('t1');
      expect(result).toEqual(invitations);
    });
  });

  describe('revoke', () => {
    it('should revoke a pending invitation', async () => {
      repo.getById.mockResolvedValue({
        id: 'inv1',
        tenantId: 't1',
        status: 'pending',
      });
      await service.revoke('inv1', 't1');
      expect(repo.updateStatus).toHaveBeenCalledWith('inv1', 'revoked');
    });

    it('should throw NotFoundException if invitation not found', async () => {
      await expect(service.revoke('missing', 't1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if belongs to another tenant', async () => {
      repo.getById.mockResolvedValue({
        id: 'inv1',
        tenantId: 'other-tenant',
        status: 'pending',
      });
      await expect(service.revoke('inv1', 't1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if not pending', async () => {
      repo.getById.mockResolvedValue({
        id: 'inv1',
        tenantId: 't1',
        status: 'accepted',
      });
      await expect(service.revoke('inv1', 't1')).rejects.toThrow(ConflictException);
    });
  });

  describe('getByToken', () => {
    it('should return valid invitation', async () => {
      repo.getByToken.mockResolvedValue({
        id: 'inv1',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86400000).toISOString(), // tomorrow
      });
      const result = await service.getByToken('tok123');
      expect(result.isValid).toBe(true);
      expect(result.invitation.id).toBe('inv1');
    });

    it('should throw NotFoundException for unknown token', async () => {
      await expect(service.getByToken('unknown')).rejects.toThrow(NotFoundException);
    });

    it('should return invalid for non-pending status', async () => {
      repo.getByToken.mockResolvedValue({
        id: 'inv1',
        status: 'accepted',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      const result = await service.getByToken('tok123');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('accepted');
    });

    it('should mark as expired and return invalid for expired invitation', async () => {
      repo.getByToken.mockResolvedValue({
        id: 'inv1',
        status: 'pending',
        expiresAt: new Date(Date.now() - 86400000).toISOString(), // yesterday
      });
      const result = await service.getByToken('tok123');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('expired');
      expect(repo.updateStatus).toHaveBeenCalledWith('inv1', 'expired');
    });
  });

  describe('accept', () => {
    it('should accept a pending, non-expired invitation', async () => {
      repo.getById.mockResolvedValue({
        id: 'inv1',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      const result = await service.accept('inv1');
      expect(result.status).toBe('accepted');
      expect(repo.updateStatus).toHaveBeenCalledWith('inv1', 'accepted', {
        acceptedAt: expect.any(String),
      });
    });

    it('should throw NotFoundException if not found', async () => {
      await expect(service.accept('missing')).rejects.toThrow(NotFoundException);
    });

    it('should throw GoneException if already accepted', async () => {
      repo.getById.mockResolvedValue({
        id: 'inv1',
        status: 'accepted',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      await expect(service.accept('inv1')).rejects.toThrow(GoneException);
    });

    it('should throw GoneException and mark expired if past expiresAt', async () => {
      repo.getById.mockResolvedValue({
        id: 'inv1',
        status: 'pending',
        expiresAt: new Date(Date.now() - 86400000).toISOString(),
      });
      await expect(service.accept('inv1')).rejects.toThrow(GoneException);
      expect(repo.updateStatus).toHaveBeenCalledWith('inv1', 'expired');
    });
  });

  describe('findPendingForEmail', () => {
    it('should delegate to repo with lowercased email', async () => {
      repo.getByEmail.mockResolvedValue([{ id: 'inv1' }]);
      const result = await service.findPendingForEmail('TEST@B.COM');
      expect(result).toHaveLength(1);
      expect(repo.getByEmail).toHaveBeenCalledWith('test@b.com');
    });
  });

  describe('cleanupExpired', () => {
    it('should delegate to repo', async () => {
      repo.deleteExpired.mockResolvedValue(5);
      const result = await service.cleanupExpired();
      expect(result).toBe(5);
    });
  });
});
