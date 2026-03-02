import type {
	CreateJourneyInput,
	Journey,
	UpdateJourneyInput,
} from "@aijourney/shared";
import { generateId, nowISO } from "@aijourney/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { JourneysRepository } from "./journeys.repository";

@Injectable()
export class JourneysService {
	constructor(@Inject(JourneysRepository) private readonly repo: JourneysRepository) {}

	async create(
		input: CreateJourneyInput,
		runRequestId?: string,
	): Promise<Journey> {
		const now = nowISO();
		const journey: Journey = {
			id: generateId(),
			userId: input.userId,
			version: 1,
			title: input.title,
			description: input.description,
			status: "draft",
			currentLevel: input.currentLevel ?? "L0",
			competencyAreas: input.competencyAreas,
			generatedBy: {
				runRequestId: runRequestId || "",
				model: "",
				promptVersion: "",
			},
			metadata: input.metadata,
			createdAt: now,
			updatedAt: now,
		};
		return this.repo.create(journey);
	}

	async getById(id: string): Promise<Journey> {
		const journey = await this.repo.getById(id);
		if (!journey) throw new NotFoundException(`Journey ${id} not found`);
		return journey;
	}

	async listByUser(userId: string): Promise<Journey[]> {
		return this.repo.listByUser(userId);
	}

	async update(id: string, input: UpdateJourneyInput): Promise<Journey> {
		await this.repo.update(id, { ...input, updatedAt: nowISO() });
		return this.getById(id);
	}
}
