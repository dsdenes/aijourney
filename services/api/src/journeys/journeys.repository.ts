import type { Journey } from "@aijourney/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Db } from "mongodb";
import { MONGODB_DB } from "../mongodb/mongodb.module";

interface JourneyDoc {
	_id: string;
	[key: string]: unknown;
}

function toDoc(journey: Journey): JourneyDoc {
	const { id, ...rest } = journey;
	return { _id: id, ...rest } as JourneyDoc;
}

function fromDoc(doc: JourneyDoc): Journey {
	const { _id, ...rest } = doc;
	return { id: _id, ...rest } as Journey;
}

@Injectable()
export class JourneysRepository {
	private readonly col;

	constructor(@Inject(MONGODB_DB) db: Db) {
		this.col = db.collection<JourneyDoc>("journeys");
	}

	async create(journey: Journey): Promise<Journey> {
		await this.col.insertOne(toDoc(journey));
		return journey;
	}

	async getById(id: string): Promise<Journey | undefined> {
		const doc = await this.col.findOne({ _id: id });
		return doc ? fromDoc(doc) : undefined;
	}

	async listByUser(userId: string): Promise<Journey[]> {
		const docs = await this.col
			.find({ userId })
			.sort({ createdAt: -1 })
			.toArray();
		return docs.map((d) => fromDoc(d));
	}

	async listByTenant(tenantId: string, limit = 200): Promise<Journey[]> {
		const docs = await this.col
			.find({ tenantId })
			.sort({ createdAt: -1 })
			.limit(limit)
			.toArray();
		return docs.map((d) => fromDoc(d));
	}

	async update(id: string, updates: Partial<Journey>): Promise<void> {
		const { id: _id, ...rest } = updates;
		if (Object.keys(rest).length === 0) return;
		await this.col.updateOne({ _id: id }, { $set: rest });
	}
}
