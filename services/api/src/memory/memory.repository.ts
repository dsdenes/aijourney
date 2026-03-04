import type {
	MemoryCategory,
	MemoryExtraction,
	MemoryFact,
	MemorySource,
} from "@aijourney/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Db } from "mongodb";
import { MONGODB_DB } from "../mongodb/mongodb.module";

interface MemoryFactDoc {
	_id: string;
	[key: string]: unknown;
}

interface MemoryExtractionDoc {
	_id: string;
	[key: string]: unknown;
}

function toFactDoc(fact: MemoryFact): MemoryFactDoc {
	const { id, ...rest } = fact;
	return { _id: id, ...rest } as MemoryFactDoc;
}

function fromFactDoc(doc: MemoryFactDoc): MemoryFact {
	const { _id, ...rest } = doc;
	return { id: _id, ...rest } as MemoryFact;
}

function toExtractionDoc(ext: MemoryExtraction): MemoryExtractionDoc {
	const { id, ...rest } = ext;
	return { _id: id, ...rest } as MemoryExtractionDoc;
}

function fromExtractionDoc(doc: MemoryExtractionDoc): MemoryExtraction {
	const { _id, ...rest } = doc;
	return { id: _id, ...rest } as MemoryExtraction;
}

@Injectable()
export class MemoryRepository {
	private readonly facts;
	private readonly extractions;

	constructor(@Inject(MONGODB_DB) db: Db) {
		this.facts = db.collection<MemoryFactDoc>("memory_facts");
		this.extractions = db.collection<MemoryExtractionDoc>(
			"memory_extractions",
		);
	}

	// --- Facts ---

	async createFact(fact: MemoryFact): Promise<MemoryFact> {
		await this.facts.insertOne(toFactDoc(fact));
		return fact;
	}

	async createManyFacts(facts: MemoryFact[]): Promise<void> {
		if (facts.length === 0) return;
		await this.facts.insertMany(facts.map(toFactDoc));
	}

	async getFactsByUser(userId: string): Promise<MemoryFact[]> {
		const docs = await this.facts
			.find({ userId, supersededBy: { $exists: false } })
			.sort({ createdAt: -1 })
			.toArray();
		return docs.map(fromFactDoc);
	}

	async getAllFactsByUser(userId: string): Promise<MemoryFact[]> {
		const docs = await this.facts
			.find({ userId })
			.sort({ createdAt: -1 })
			.toArray();
		return docs.map(fromFactDoc);
	}

	async getFactsByCategory(
		userId: string,
		category: MemoryCategory,
	): Promise<MemoryFact[]> {
		const docs = await this.facts
			.find({ userId, category, supersededBy: { $exists: false } })
			.sort({ createdAt: -1 })
			.toArray();
		return docs.map(fromFactDoc);
	}

	async supersedeFact(factId: string, newFactId: string): Promise<void> {
		await this.facts.updateOne(
			{ _id: factId },
			{ $set: { supersededBy: newFactId } },
		);
	}

	async deleteFact(factId: string): Promise<void> {
		await this.facts.deleteOne({ _id: factId });
	}

	async deleteAllFactsByUser(userId: string): Promise<number> {
		const result = await this.facts.deleteMany({ userId });
		return result.deletedCount;
	}

	async countFactsByUser(userId: string): Promise<number> {
		return this.facts.countDocuments({
			userId,
			supersededBy: { $exists: false },
		});
	}

	async countFactsByCategory(
		userId: string,
	): Promise<Record<MemoryCategory, number>> {
		const pipeline = [
			{ $match: { userId, supersededBy: { $exists: false } } },
			{ $group: { _id: "$category", count: { $sum: 1 } } },
		];
		const results = await this.facts.aggregate(pipeline).toArray();
		const counts: Record<string, number> = {
			preferences: 0,
			goals: 0,
			skills: 0,
			context: 0,
			personality: 0,
		};
		for (const row of results) {
			counts[row._id as string] = row.count as number;
		}
		return counts as Record<MemoryCategory, number>;
	}

	// --- Global stats (admin) ---

	async totalFactCount(): Promise<number> {
		return this.facts.countDocuments({
			supersededBy: { $exists: false },
		});
	}

	async globalCategoryCounts(): Promise<Record<MemoryCategory, number>> {
		const pipeline = [
			{ $match: { supersededBy: { $exists: false } } },
			{ $group: { _id: "$category", count: { $sum: 1 } } },
		];
		const results = await this.facts.aggregate(pipeline).toArray();
		const counts: Record<string, number> = {
			preferences: 0,
			goals: 0,
			skills: 0,
			context: 0,
			personality: 0,
		};
		for (const row of results) {
			counts[row._id as string] = row.count as number;
		}
		return counts as Record<MemoryCategory, number>;
	}

	async globalSourceCounts(): Promise<Record<MemorySource, number>> {
		const pipeline = [
			{ $match: { supersededBy: { $exists: false } } },
			{ $group: { _id: "$source", count: { $sum: 1 } } },
		];
		const results = await this.facts.aggregate(pipeline).toArray();
		const counts: Record<string, number> = {
			"ai-planner": 0,
			"ai-chat": 0,
			"prompt-optimizer": 0,
		};
		for (const row of results) {
			counts[row._id as string] = row.count as number;
		}
		return counts as Record<MemorySource, number>;
	}

	// --- Extractions (audit log) ---

	async createExtraction(ext: MemoryExtraction): Promise<void> {
		await this.extractions.insertOne(toExtractionDoc(ext));
	}

	async getRecentExtractions(limit = 20): Promise<MemoryExtraction[]> {
		const docs = await this.extractions
			.find()
			.sort({ processedAt: -1 })
			.limit(limit)
			.toArray();
		return docs.map(fromExtractionDoc);
	}

	async getExtractionsByUser(
		userId: string,
		limit = 20,
	): Promise<MemoryExtraction[]> {
		const docs = await this.extractions
			.find({ userId })
			.sort({ processedAt: -1 })
			.limit(limit)
			.toArray();
		return docs.map(fromExtractionDoc);
	}
}
