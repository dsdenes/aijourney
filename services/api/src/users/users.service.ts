import type { CreateUserInput, UpdateUserInput, User } from "@aijourney/shared";
import { generateId, nowISO } from "@aijourney/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { UsersRepository } from "./users.repository";

@Injectable()
export class UsersService {
	constructor(@Inject(UsersRepository) private readonly usersRepo: UsersRepository) {}

	async create(input: CreateUserInput): Promise<User> {
		const now = nowISO();
		const user: User = {
			id: generateId(),
			googleId: input.googleId,
			email: input.email,
			name: input.name,
			avatarUrl: input.avatarUrl,
			role: input.role ?? "employee",
			globalRole: input.globalRole ?? "user",
			tenantId: input.tenantId,
			orgRole: input.orgRole ?? "member",
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
		await this.usersRepo.update(id, { ...input, updatedAt: nowISO() });
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
}
