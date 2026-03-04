import type { RunRequest } from "@aijourney/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Db } from "mongodb";
import { MONGODB_DB } from "../mongodb/mongodb.module";

interface RunDoc {
	_id: string;
	[key: string]: unknown;
}

function toDoc(run: RunRequest): RunDoc {
	const { id, ...rest } = run;
	return { _id: id, ...rest } as RunDoc;
}

function fromDoc(doc: RunDoc): RunRequest {
	const { _id, ...rest } = doc;
	return { id: _id, ...rest } as RunRequest;
}

@Injectable()
export class RunsRepository {
	private readonly col;

	constructor(@Inject(MONGODB_DB) db: Db) {
		this.col = db.collection<RunDoc>("run_requests");
	}

	async create(run: RunRequest): Promise<RunRequest> {
		await this.col.insertOne(toDoc(run));
		return run;
	}

	async getById(id: string): Promise<RunRequest | undefined> {
		const doc = await this.col.findOne({ _id: id });
		return doc ? fromDoc(doc) : undefined;
	}

	async listByUser(userId: string): Promise<RunRequest[]> {
		const docs = await this.col.find({ userId }).toArray();
		return docs.map((d) => fromDoc(d));
	}

	async listByStatus(status: string): Promise<RunRequest[]> {
		const docs = await this.col
			.find({ status })
			.sort({ createdAt: -1 })
			.toArray();
		return docs.map((d) => fromDoc(d));
	}

	async listByTenant(tenantId: string, limit = 200): Promise<RunRequest[]> {
		const docs = await this.col
			.find({ tenantId })
			.sort({ createdAt: -1 })
			.limit(limit)
			.toArray();
		return docs.map((d) => fromDoc(d));
	}

	async updateStatus(
		id: string,
		status: string,
		extra: Record<string, unknown> = {},
	): Promise<void> {
		const updates = {
			status,
			updatedAt: new Date().toISOString(),
			...extra,
		};
		await this.col.updateOne({ _id: id }, { $set: updates });
	}

	async listAll(limit = 100): Promise<RunRequest[]> {
		const docs = await this.col.find({}).limit(limit).toArray();
		return docs.map((d) => fromDoc(d));
	}
}
