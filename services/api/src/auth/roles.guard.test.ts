import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GLOBAL_ROLES_KEY } from '../common/decorators/global-roles.decorator';
import { ORG_ROLES_KEY } from '../common/decorators/org-roles.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  function createMockContext(user?: Record<string, unknown>): ExecutionContext {
    return {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
        getResponse: vi.fn(),
        getNext: vi.fn(),
      }),
      getArgs: vi.fn(),
      getArgByIndex: vi.fn(),
      switchToRpc: vi.fn(),
      switchToWs: vi.fn(),
      getType: vi.fn(),
    } as unknown as ExecutionContext;
  }

  function mockRoles(opts: { global?: string[]; org?: string[]; legacy?: string[] }) {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
      if (key === GLOBAL_ROLES_KEY) return opts.global ?? undefined;
      if (key === ORG_ROLES_KEY) return opts.org ?? undefined;
      if (key === ROLES_KEY) return opts.legacy ?? undefined;
      return undefined;
    });
  }

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should allow access when no roles are required', () => {
    mockRoles({});
    const context = createMockContext({ userId: 'u1', role: 'employee' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when empty roles array', () => {
    mockRoles({ global: [], org: [], legacy: [] });
    const context = createMockContext({ userId: 'u1', role: 'employee' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when user has required legacy role', () => {
    mockRoles({ legacy: ['admin'] });
    const context = createMockContext({
      userId: 'u1',
      role: 'admin',
      globalRole: 'user',
      orgRole: 'member',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny access when user lacks required legacy role', () => {
    mockRoles({ legacy: ['admin'] });
    const context = createMockContext({
      userId: 'u1',
      role: 'employee',
      globalRole: 'user',
      orgRole: 'member',
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should deny access when no user on request', () => {
    mockRoles({ legacy: ['admin'] });
    const context = createMockContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should allow if user role matches any of multiple required legacy roles', () => {
    mockRoles({ legacy: ['admin', 'employee'] });
    const context = createMockContext({
      userId: 'u1',
      role: 'employee',
      globalRole: 'user',
      orgRole: 'member',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow superadmin to bypass all checks', () => {
    mockRoles({ org: ['owner'] });
    const context = createMockContext({
      userId: 'u1',
      role: 'employee',
      globalRole: 'superadmin',
      orgRole: 'member',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should check global roles', () => {
    mockRoles({ global: ['superadmin'] });
    const context = createMockContext({
      userId: 'u1',
      globalRole: 'superadmin',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny non-superadmin from global-role-restricted endpoint', () => {
    mockRoles({ global: ['superadmin'] });
    const context = createMockContext({
      userId: 'u1',
      globalRole: 'user',
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should check org roles', () => {
    mockRoles({ org: ['owner', 'admin'] });
    const context = createMockContext({
      userId: 'u1',
      globalRole: 'user',
      orgRole: 'admin',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny member from org-admin-only endpoint', () => {
    mockRoles({ org: ['owner', 'admin'] });
    const context = createMockContext({
      userId: 'u1',
      globalRole: 'user',
      orgRole: 'member',
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
