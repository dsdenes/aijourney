import type { CreateUserInput, UpdateUserInput, User } from '@aijourney/shared';
import { generateId, nowISO } from '@aijourney/shared';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(@Inject(UsersRepository) private readonly usersRepo: UsersRepository) {}

  private resolveLegacyRole(input: {
    role?: User['role'];
    orgRole?: User['orgRole'];
    globalRole?: User['globalRole'];
  }): User['role'] {
    if (input.globalRole === 'superadmin' || input.orgRole === 'admin' || input.role === 'admin') {
      return 'admin';
    }

    return 'employee';
  }

  async create(input: CreateUserInput): Promise<User> {
    if (!input.tenantId?.trim()) {
      throw new BadRequestException('Users must belong to a tenant');
    }

    const now = nowISO();
    const user: User = {
      id: generateId(),
      googleId: input.googleId,
      email: input.email,
      name: input.name,
      avatarUrl: input.avatarUrl,
      role: this.resolveLegacyRole(input),
      globalRole: input.globalRole ?? 'user',
      tenantId: input.tenantId,
      orgRole: input.orgRole ?? 'member',
      onboardingComplete: false,
      preferences: {},
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };
    return this.usersRepo.create(user);
  }

  async getById(id: string): Promise<User> {
    const user = await this.usersRepo.getById(id);
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async getByEmail(email: string): Promise<User | undefined> {
    return this.usersRepo.getByEmail(email);
  }

  async getByGoogleId(googleId: string): Promise<User | undefined> {
    return this.usersRepo.getByGoogleId(googleId);
  }

  async update(id: string, input: UpdateUserInput): Promise<User> {
    if (input.tenantId !== undefined && !input.tenantId.trim()) {
      throw new BadRequestException('Users must belong to a tenant');
    }

    const existing = await this.getById(id);
    const nextGlobalRole = input.globalRole ?? existing.globalRole;
    const nextOrgRole = input.orgRole ?? existing.orgRole;

    await this.usersRepo.update(id, {
      ...input,
      role: this.resolveLegacyRole({
        role: input.role ?? existing.role,
        globalRole: nextGlobalRole,
        orgRole: nextOrgRole,
      }),
      updatedAt: nowISO(),
    });

    return this.getById(id);
  }

  async listAll(): Promise<User[]> {
    return this.usersRepo.listAll();
  }

  async listByTenant(tenantId: string): Promise<User[]> {
    return this.usersRepo.listByTenant(tenantId);
  }

  async countByTenant(tenantId: string): Promise<number> {
    return this.usersRepo.countByTenant(tenantId);
  }

  async countAll(): Promise<number> {
    return this.usersRepo.countAll();
  }

  async assignAllUsersToTenant(tenantId: string, adminEmails: string[] = []): Promise<number> {
    return this.usersRepo.assignAllUsersToTenant(tenantId, { adminEmails });
  }
}
