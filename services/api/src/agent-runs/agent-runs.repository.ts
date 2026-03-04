import type { AgentRun } from "@aijourney/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Db } from "mongodb";
import { MONGODB_DB } from "../mongodb/mongodb.module";

interface AgentRunDoc {
	_id: string;
	[key: string]: unknown;
}

function toDoc(run: AgentRun): AgentRunDoc {
	const { id, ...rest } = run;
	return { _id: id, ...rest } as AgentRunDoc;
}

function fromDoc(doc: AgentRunDoc): AgentRun {
	const { _id, ...rest } = doc;
	return { id: _id, ...rest } as AgentRun;
}

@Injectable()
export class AgentRunsRepository {
	private readonly col;

	constructor(@Inject(MONGODB_DB) db: Db) {
		this.col = db.collection<AgentRunDoc>("agent_runs");
	}

	async create(run: AgentRun): Promise<AgentRun> {
		await this.col.insertOne(toDoc(run));
		return run;
	}

	async getById(id: string): Promise<AgentRun | undefined> {
		const doc = await this.col.findOne({ _id: id });
		return doc ? fromDoc(doc) : undefined;
	}

	async update(id: string, updates: Partial<AgentRun>): Promise<void> {
		const { id: _id, ...rest } = updates;
		if (Object.keys(rest).length === 0) return;
		await this.col.updateOne({ _id: id }, { $set: rest });
	}

	async listAll(limit = 200): Promise<AgentRun[]> {
		const docs = await this.col.find({}).limit(limit).toArray();
		return docs.map((d) => fromDoc(d));
	}

	async listByTenant(tenantId: string, limit = 200): Promise<AgentRun[]> {
		const docs = await this.col
			.find({ tenantId })
			.sort({ createdAt: -1 })
			.limit(limit)
			.toArray();
		return docs.map((d) => fromDoc(d));
	}

	async listByAgent(agent: string, limit = 100): Promise<AgentRun[]> {
		const docs = await this.col
			.find({ agent })
			.sort({ createdAt: -1 })
			.limit(limit)
			.toArray();
		return docs.map((d) => fromDoc(d));
	}

	async listByStatus(status: string, limit = 100): Promise<AgentRun[]> {
		const docs = await this.col
			.find({ status })
			.sort({ createdAt: -1 })
			.limit(limit)
			.toArray();
		return docs.map((d) => fromDoc(d));
	}
}
