import {
	type CreateTenantInput,
	type Tenant,
	type TenantPlan,
	type UpdateTenantInput,
	PLAN_LIMITS,
	generateId,
	nowISO,
} from "@aijourney/shared";
import {
	ConflictException,
	Inject,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { TenantsRepository } from "./tenants.repository";

@Injectable()
export class TenantsService {
	constructor(
		@Inject(TenantsRepository) private readonly repo: TenantsRepository,
	) {}

	async create(input: CreateTenantInput): Promise<Tenant> {
		// Check slug uniqueness
		const existing = await this.repo.getBySlug(input.slug);
		if (existing) {
			throw new ConflictException(`Slug "${input.slug}" is already taken`);
		}

		const plan = input.plan || "free";
		const limits = PLAN_LIMITS[plan];
		const now = nowISO();

		const tenant: Tenant = {
			id: generateId(),
			name: input.name,
			slug: input.slug,
			plan,
			settings: {},
			quotas: {
				maxUsers: limits.maxUsers,
				maxLlmCallsPerMonth: limits.maxLlmCallsPerMonth,
				additionalLlmCalls: 0,
			},
			usage: {
				currentPeriodStart: now,
				llmCallsUsed: 0,
				lastResetAt: now,
			},
			createdAt: now,
			updatedAt: now,
		};

		return this.repo.create(tenant);
	}

	async getById(id: string): Promise<Tenant> {
		const tenant = await this.repo.getById(id);
		if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
		return tenant;
	}

	async getBySlug(slug: string): Promise<Tenant | undefined> {
		return this.repo.getBySlug(slug);
	}

	async update(id: string, input: UpdateTenantInput): Promise<Tenant> {
		const updates: Record<string, unknown> = { updatedAt: nowISO() };
		if (input.name) updates["name"] = input.name;
		if (input.settings) updates["settings"] = input.settings;

		await this.repo.update(id, updates as Partial<Tenant>);
		return this.getById(id);
	}

	async updatePlan(id: string, plan: TenantPlan): Promise<Tenant> {
		const limits = PLAN_LIMITS[plan];
		await this.repo.updatePlan(id, plan, {
			maxUsers: limits.maxUsers,
			maxLlmCallsPerMonth: limits.maxLlmCallsPerMonth,
		});
		return this.getById(id);
	}

	async delete(id: string): Promise<void> {
		await this.repo.delete(id);
	}

	async listAll(): Promise<Tenant[]> {
		return this.repo.listAll();
	}

	async incrementLlmUsage(tenantId: string): Promise<void> {
		await this.repo.incrementUsage(tenantId, "usage.llmCallsUsed", 1);
	}

	async resetUsage(tenantId: string): Promise<void> {
		await this.repo.resetUsage(tenantId);
	}

	async count(): Promise<number> {
		return this.repo.count();
	}
}
