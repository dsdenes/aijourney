import { NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JourneysRepository } from "./journeys.repository";
import { JourneysService } from "./journeys.service";

describe("JourneysService", () => {
	let service: JourneysService;
	let repo: Record<string, ReturnType<typeof vi.fn>>;

	beforeEach(async () => {
		repo = {
			create: vi.fn(),
			getById: vi.fn(),
			listByUser: vi.fn(),
			update: vi.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				JourneysService,
				{ provide: JourneysRepository, useValue: repo },
			],
		}).compile();

		service = module.get<JourneysService>(JourneysService);
	});

	describe("create", () => {
		it("should create a journey with ULID and defaults", async () => {
			repo.create.mockImplementation((j: unknown) => Promise.resolve(j));

			const result = await service.create({
				userId: "u1",
				title: "My AI Journey",
				description: "Test",
				competencyAreas: ["prompt-engineering"],
				metadata: {
					estimatedDurationWeeks: 8,
					difficultyProgression: "linear",
					roleCategory: "developer",
				},
			});

			expect(result.id).toHaveLength(26);
			expect(result.userId).toBe("u1");
			expect(result.title).toBe("My AI Journey");
			expect(result.status).toBe("draft");
			expect(result.currentLevel).toBe("L0");
			expect(result.version).toBe(1);
			expect(result.createdAt).toBeDefined();
			expect(result.updatedAt).toBeDefined();
		});

		it("should use provided currentLevel", async () => {
			repo.create.mockImplementation((j: unknown) => Promise.resolve(j));

			const result = await service.create({
				userId: "u1",
				title: "Advanced",
				description: "Test",
				currentLevel: "L2",
				competencyAreas: ["automation"],
				metadata: {
					estimatedDurationWeeks: 4,
					difficultyProgression: "steep",
					roleCategory: "engineer",
				},
			});

			expect(result.currentLevel).toBe("L2");
		});

		it("should set generatedBy.runRequestId when provided", async () => {
			repo.create.mockImplementation((j: unknown) => Promise.resolve(j));

			const result = await service.create(
				{
					userId: "u1",
					title: "Generated Journey",
					description: "Test",
					competencyAreas: ["ai-tools"],
					metadata: {
						estimatedDurationWeeks: 6,
						difficultyProgression: "gradual",
						roleCategory: "analyst",
					},
				},
				"run-123",
			);

			expect(result.generatedBy.runRequestId).toBe("run-123");
		});
	});

	describe("getById", () => {
		it("should return journey when found", async () => {
			const journey = { id: "j1", title: "Test" };
			repo.getById.mockResolvedValue(journey);

			const result = await service.getById("j1");
			expect(result).toEqual(journey);
		});

		it("should throw NotFoundException when not found", async () => {
			repo.getById.mockResolvedValue(undefined);

			await expect(service.getById("nonexistent")).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	describe("listByUser", () => {
		it("should delegate to repository", async () => {
			repo.listByUser.mockResolvedValue([{ id: "j1" }, { id: "j2" }]);

			const result = await service.listByUser("u1");
			expect(result).toHaveLength(2);
			expect(repo.listByUser).toHaveBeenCalledWith("u1");
		});
	});

	describe("update", () => {
		it("should update and return journey", async () => {
			const updatedJourney = { id: "j1", title: "Updated" };
			repo.update.mockResolvedValue(undefined);
			repo.getById.mockResolvedValue(updatedJourney);

			const result = await service.update("j1", { title: "Updated" });
			expect(result.title).toBe("Updated");
			expect(repo.update).toHaveBeenCalledWith(
				"j1",
				expect.objectContaining({
					title: "Updated",
					updatedAt: expect.any(String),
				}),
			);
		});
	});
});
