import type { CreateUserInput, UpdateUserInput, User } from '@aijourney/shared';
import { generateId, nowISO } from '@aijourney/shared';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { UserTenantMembershipsService } from './user-tenant-memberships.service';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    @Inject(UsersRepository) private readonly usersRepo: UsersRepository,
    @Inject(UserTenantMembershipsService)
    private readonly membershipsService: UserTenantMembershipsService,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const now = nowISO();
    const user: User = {
      id: generateId(),
      googleId: input.googleId,
      email: input.email,
      name: input.name,
      avatarUrl: input.avatarUrl,
      role: input.role ?? 'employee',
      globalRole: input.globalRole ?? 'user',
      tenantId: input.tenantId,
      orgRole: input.orgRole ?? 'member',
      onboardingComplete: false,
      preferences: {},
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };
    const created = await this.usersRepo.create(user);
    await this.membershipsService.ensureMembership(created.id, created.tenantId, created.orgRole);
    return created;
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
    await this.usersRepo.update(id, { ...input, updatedAt: nowISO() });
    return this.getById(id);
  }

  async listAll(): Promise<User[]> {
    return this.usersRepo.listAll();
  }

  async listByTenant(tenantId: string): Promise<User[]> {
    const [memberships, legacyUsers] = await Promise.all([
      this.membershipsService.listByTenant(tenantId),
      this.usersRepo.listByTenant(tenantId),
    ]);

    const legacyById = new Map(legacyUsers.map((user) => [user.id, user]));
    const membershipUserIds = Array.from(
      new Set(memberships.map((membership) => membership.userId)),
    );
    const membershipUsers = await this.usersRepo.getByIds(
      membershipUserIds.filter((userId) => !legacyById.has(userId)),
    );
    const combined = new Map<string, User>();

    for (const user of legacyUsers) {
      combined.set(user.id, user);
    }

    for (const user of membershipUsers) {
      combined.set(user.id, user);
    }

    return Array.from(combined.values());
  }

  async countByTenant(tenantId: string): Promise<number> {
    const users = await this.listByTenant(tenantId);
    return users.length;
  }

  async countAll(): Promise<number> {
    return this.usersRepo.countAll();
  }

  async listTenantMemberships(userId: string) {
    const user = await this.getById(userId);
    return this.membershipsService.listByUser(userId, user);
  }

  async assignTenantMembership(
    userId: string,
    tenantId: string,
    orgRole: 'owner' | 'admin' | 'member',
    options: { makeActive?: boolean } = {},
  ) {
    const user = await this.getById(userId);
    const membership = await this.membershipsService.ensureMembership(userId, tenantId, orgRole);
    const shouldActivate = !user.tenantId || options.makeActive;

    if (shouldActivate || user.tenantId === tenantId) {
      await this.usersRepo.update(userId, {
        tenantId,
        orgRole,
        updatedAt: nowISO(),
      });
    }

    return membership;
  }

  async switchActiveTenant(
    userId: string,
    tenantId: string,
  ): Promise<{ tenantId: string; orgRole: string }> {
    const user = await this.getById(userId);
    const membership = await this.membershipsService.getByUserAndTenant(userId, tenantId, user);
    if (!membership) {
      throw new ForbiddenException('User is not a member of the requested tenant');
    }

    await this.usersRepo.update(userId, {
      tenantId,
      orgRole: membership.orgRole,
      updatedAt: nowISO(),
    });

    return {
      tenantId,
      orgRole: membership.orgRole,
    };
  }
}
