import { UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppConfigService } from '../config/config.service';
import { InvitationsService } from '../invitations/invitations.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

function makeIdToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fake-signature`;
}

describe('AuthService (multi-tenant)', () => {
  let service: AuthService;
  let usersService: Record<string, ReturnType<typeof vi.fn>>;
  let tenantsService: Record<string, ReturnType<typeof vi.fn>>;
  let invitationsService: Record<string, ReturnType<typeof vi.fn>>;
  let configService: { config: Record<string, string> };
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    usersService = {
      getByEmail: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn().mockImplementation(async (id) => ({
        id,
        email: 'existing@mito.hu',
        name: 'Existing',
        role: 'employee',
        globalRole: 'user',
        tenantId: 'existing-tenant',
        orgRole: 'member',
        onboardingComplete: true,
      })),
      create: vi.fn().mockImplementation(async (input) => ({
        id: 'new-user-id',
        email: input.email,
        name: input.name,
        role: input.role,
        globalRole: input.globalRole,
        tenantId: input.tenantId,
        orgRole: input.orgRole,
        onboardingComplete: false,
      })),
      update: vi.fn().mockImplementation(async (id, updates) => ({
        id,
        email: 'existing@mito.hu',
        name: 'Existing',
        role: 'employee',
        globalRole: updates.globalRole ?? 'user',
        tenantId: 'existing-tenant',
        orgRole: 'member',
        onboardingComplete: true,
        ...updates,
      })),
    };

    tenantsService = {
      create: vi.fn().mockResolvedValue({ id: 'new-tenant-id', slug: 'alice' }),
      getById: vi.fn().mockImplementation(async (tenantId) => ({
        id: tenantId,
        name: tenantId === 'new-tenant-id' ? "Alice's Organization" : 'Existing Tenant',
      })),
    };

    invitationsService = {
      findPendingForEmail: vi.fn().mockResolvedValue([]),
      accept: vi.fn().mockResolvedValue(undefined),
    };

    configService = {
      config: {
        GOOGLE_CLIENT_ID: 'test-client-id',
        GOOGLE_CLIENT_SECRET: 'test-client-secret',
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AppConfigService, useValue: configService },
        { provide: UsersService, useValue: usersService },
        { provide: TenantsService, useValue: tenantsService },
        { provide: InvitationsService, useValue: invitationsService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Mock global fetch for Google token exchange
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockGoogleTokenExchange(email: string, name: string, sub = 'google-sub-123') {
    const idToken = makeIdToken({ sub, email, name, email_verified: true });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id_token: idToken,
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    });
    return idToken;
  }

  describe('exchangeCodeForTokens', () => {
    it('should throw when Google OAuth not configured', async () => {
      configService.config.GOOGLE_CLIENT_ID = '';
      configService.config.GOOGLE_CLIENT_SECRET = '';

      await expect(service.exchangeCodeForTokens('code', 'http://redirect')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw when Google returns error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      });

      await expect(service.exchangeCodeForTokens('bad-code', 'http://redirect')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('upsertUser - existing user', () => {
    it('should update lastLoginAt for existing user', async () => {
      mockGoogleTokenExchange('existing@mito.hu', 'Existing');
      usersService.getByEmail.mockResolvedValue({
        id: 'u1',
        email: 'existing@mito.hu',
        name: 'Existing',
        role: 'employee',
        globalRole: 'user',
        tenantId: 'existing-tenant',
        orgRole: 'member',
        googleId: 'google-sub-123',
        onboardingComplete: true,
      });

      const result = await service.exchangeCodeForTokens('code', 'http://redirect');
      expect(result.user.userId).toBe('u1');
      expect(result.user.tenantId).toBe('existing-tenant');
      expect(usersService.update).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          lastLoginAt: expect.any(String),
        }),
      );
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('should auto-promote superadmin on login', async () => {
      mockGoogleTokenExchange('dsdenes@gmail.com', 'Denes');
      usersService.getByEmail.mockResolvedValue({
        id: 'u1',
        email: 'dsdenes@gmail.com',
        name: 'Denes',
        role: 'admin',
        globalRole: 'user', // not yet superadmin
        tenantId: 'existing-tenant',
        orgRole: 'owner',
        googleId: 'sub1',
        onboardingComplete: true,
      });

      await service.exchangeCodeForTokens('code', 'http://redirect');
      expect(usersService.update).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          globalRole: 'superadmin',
        }),
      );
    });

    it('should backfill googleId if missing', async () => {
      mockGoogleTokenExchange('existing@mito.hu', 'Existing', 'new-google-sub');
      usersService.getByEmail.mockResolvedValue({
        id: 'u1',
        email: 'existing@mito.hu',
        name: 'Existing',
        role: 'employee',
        globalRole: 'user',
        tenantId: 'existing-tenant',
        orgRole: 'member',
        // no googleId
        onboardingComplete: true,
      });

      await service.exchangeCodeForTokens('code', 'http://redirect');
      expect(usersService.update).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          googleId: 'new-google-sub',
        }),
      );
    });
  });

  describe('upsertUser - invited user', () => {
    it('should join tenant from invitation and mark accepted', async () => {
      mockGoogleTokenExchange('new@corp.com', 'New User');
      invitationsService.findPendingForEmail.mockResolvedValue([
        {
          id: 'inv1',
          tenantId: 'corp-tenant',
          email: 'new@corp.com',
          orgRole: 'member',
          status: 'pending',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      ]);

      const result = await service.exchangeCodeForTokens('code', 'http://redirect');
      expect(result.user.tenantId).toBe('corp-tenant');
      expect(result.user.orgRole).toBe('member');
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'corp-tenant',
          orgRole: 'member',
          globalRole: 'user',
        }),
      );
      expect(invitationsService.accept).toHaveBeenCalledWith('inv1');
    });

    it('should make invited owner role map to admin role', async () => {
      mockGoogleTokenExchange('boss@corp.com', 'Boss');
      invitationsService.findPendingForEmail.mockResolvedValue([
        {
          id: 'inv2',
          tenantId: 'corp-tenant',
          email: 'boss@corp.com',
          orgRole: 'owner',
          status: 'pending',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      ]);

      await service.exchangeCodeForTokens('code', 'http://redirect');
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'admin', // owner orgRole → admin role
          orgRole: 'owner',
        }),
      );
    });
  });

  describe('upsertUser - self-onboarding', () => {
    it('should create a new personal tenant and user as owner', async () => {
      mockGoogleTokenExchange('alice@newcorp.com', 'Alice');

      const result = await service.exchangeCodeForTokens('code', 'http://redirect');
      expect(tenantsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Alice's Organization",
          slug: expect.any(String),
          plan: 'free',
        }),
      );
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'new-tenant-id',
          orgRole: 'owner',
          role: 'admin',
          globalRole: 'user',
        }),
      );
      expect(result.user.tenantId).toBe('new-tenant-id');
      expect(result.user.orgRole).toBe('owner');
    });

    it('should auto-promote superadmin on self-onboarding', async () => {
      mockGoogleTokenExchange('dsdenes@gmail.com', 'Denes');

      await service.exchangeCodeForTokens('code', 'http://redirect');
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          globalRole: 'superadmin',
        }),
      );
    });
  });

  describe('validateUser', () => {
    it('should return user information from payload', async () => {
      const result = await service.validateUser({
        sub: 'u1',
        email: 'a@b.com',
      });
      expect(result).toEqual({ userId: 'u1', email: 'a@b.com' });
    });
  });

  describe('decodeJwtPayload', () => {
    it('should decode a valid JWT payload', () => {
      const jwt = makeIdToken({ sub: '123', email: 'test@test.com' });
      // Access private method
      const decoded = (service as any).decodeJwtPayload(jwt);
      expect(decoded.sub).toBe('123');
      expect(decoded.email).toBe('test@test.com');
    });

    it('should throw for invalid JWT format', () => {
      expect(() => (service as any).decodeJwtPayload('not-a-jwt')).toThrow(UnauthorizedException);
    });
  });
});
