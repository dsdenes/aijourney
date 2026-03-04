import type { Tenant, TenantPlan } from "@aijourney/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Db } from "mongodb";
import { MONGODB_DB } from "../mongodb/mongodb.module";

interface TenantDoc {
	_id: string;
	[key: string]: unknown;
}

function toDoc(tenant: Tenant): TenantDoc {
	const { id, ...rest } = tenant;
	return { _id: id, ...rest } as TenantDoc;
}

function fromDoc(doc: TenantDoc): Tenant {
	const { _id, ...rest } = doc;
	return { id: _id, ...rest } as Tenant;
}

@Injectable()
export class TenantsRepository {
	private readonly col;

	constructor(@Inject(MONGODB_DB) db: Db) {
		this.col = db.collection<TenantDoc>("tenants");
	}

	async create(tenant: Tenant): Promise<Tenant> {
		await this.col.insertOne(toDoc(tenant));
		return tenant;
	}

	async getById(id: string): Promise<Tenant | undefined> {
		const doc = await this.col.findOne({ _id: id });
		return doc ? fromDoc(doc) : undefined;
	}

	async getBySlug(slug: string): Promise<Tenant | undefined> {
		const doc = await this.col.findOne({ slug });
		return doc ? fromDoc(doc as TenantDoc) : undefined;
	}

	async update(id: string, updates: Partial<Tenant>): Promise<void> {
		const { id: _id, ...rest } = updates;
		if (Object.keys(rest).length === 0) return;
		await this.col.updateOne({ _id: id }, { $set: rest });
	}

	async delete(id: string): Promise<void> {
		await this.col.deleteOne({ _id: id });
	}

	async listAll(limit = 100): Promise<Tenant[]> {
		const docs = await this.col
			.find({})
			.sort({ createdAt: -1 })
			.limit(limit)
			.toArray();
		return docs.map((d) => fromDoc(d));
	}

	async incrementUsage(
		tenantId: string,
		field: string,
		amount: number,
	): Promise<void> {
		await this.col.updateOne(
			{ _id: tenantId },
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			{
				$inc: { [field]: amount } as any,
				$set: { updatedAt: new Date().toISOString() },
			},
		);
	}

	/**
	 * Raw $set update supporting MongoDB dot-notation paths.
	 */
	async updateRaw(
		tenantId: string,
		setFields: Record<string, unknown>,
	): Promise<void> {
		await this.col.updateOne(
			{ _id: tenantId },
			{ $set: { ...setFields, updatedAt: new Date().toISOString() } as Record<string, unknown> },
		);
	}

	async resetUsage(tenantId: string): Promise<void> {
		const now = new Date().toISOString();
		await this.col.updateOne(
			{ _id: tenantId },
			{
				$set: {
					"usage.llmCallsUsed": 0,
					"usage.currentPeriodStart": now,
					"usage.lastResetAt": now,
					updatedAt: now,
				},
			},
		);
	}

	async updatePlan(
		tenantId: string,
		plan: TenantPlan,
		quotas: { maxUsers: number; maxLlmCallsPerMonth: number },
	): Promise<void> {
		await this.col.updateOne(
			{ _id: tenantId },
			{
				$set: {
					plan,
					"quotas.maxUsers": quotas.maxUsers,
					"quotas.maxLlmCallsPerMonth": quotas.maxLlmCallsPerMonth,
					updatedAt: new Date().toISOString(),
				},
			},
		);
	}

	async count(): Promise<number> {
		return this.col.countDocuments({});
	}
}
