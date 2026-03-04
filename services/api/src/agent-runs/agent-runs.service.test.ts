import { Test, type TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentRunsRepository } from "./agent-runs.repository";
import { AgentRunsService } from "./agent-runs.service";

// Mock shared utilities
vi.mock("@aijourney/shared", async () => {
	const actual = await vi.importActual("@aijourney/shared");
	return {
		...actual,
		generateId: vi.fn().mockReturnValue("test-id-123"),
		nowISO: vi.fn().mockReturnValue("2026-01-15T10:00:00.000Z"),
	};
});

describe("AgentRunsService", () => {
	let service: AgentRunsService;

	const mockRepo = {
		create: vi.fn(),
		getById: vi.fn(),
		update: vi.fn(),
		listAll: vi.fn(),
		listByAgent: vi.fn(),
		listByStatus: vi.fn(),
	};

	beforeEach(async () => {
		vi.clearAllMocks();

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AgentRunsService,
				{ provide: AgentRunsRepository, useValue: mockRepo },
			],
		}).compile();

		service = module.get<AgentRunsService>(AgentRunsService);
	});

	describe("startRun", () => {
		it("should create a new run with running status", async () => {
			mockRepo.create.mockImplementation(async (run: any) => run);

			const result = await service.startRun({
				agent: "chat",
				input: "What is AI?",
				model: "gemini-3.1-flash-lite-preview",
			});

			expect(result).toMatchObject({
				id: "test-id-123",
				agent: "chat",
				status: "running",
				input: "What is AI?",
				model: "gemini-3.1-flash-lite-preview",
				createdAt: "2026-01-15T10:00:00.000Z",
			});
			expect(mockRepo.create).toHaveBeenCalledOnce();
		});

		it("should include optional metadata and fullInput", async () => {
			mockRepo.create.mockImplementation(async (run: any) => run);

			const result = await service.startRun({
				agent: "summarizer",
				input: "Summarize article",
				fullInput: "Full article text...",
				metadata: { batchId: "batch-1" },
			});

			expect(result.fullInput).toBe("Full article text...");
			expect(result.metadata).toEqual({ batchId: "batch-1" });
		});
	});

	describe("completeRun", () => {
		it("should update run with completion data", async () => {
			mockRepo.getById.mockResolvedValue({
				id: "run-1",
				metadata: { existing: "data" },
			});

			await service.completeRun("run-1", {
				output: "AI is artificial intelligence",
				tokensUsed: 150,
				promptTokens: 100,
				completionTokens: 50,
				durationMs: 800,
			});

			expect(mockRepo.update).toHaveBeenCalledWith(
				"run-1",
				expect.objectContaining({
					status: "completed",
					output: "AI is artificial intelligence",
					tokensUsed: 150,
					promptTokens: 100,
					completionTokens: 50,
					durationMs: 800,
					completedAt: "2026-01-15T10:00:00.000Z",
					metadata: { existing: "data" },
				}),
			);
		});

		it("should merge metadata from existing run", async () => {
			mockRepo.getById.mockResolvedValue({
				id: "run-1",
				metadata: { source: "test" },
			});

			await service.completeRun("run-1", {
				output: "done",
				metadata: { result: "success" },
			});

			expect(mockRepo.update).toHaveBeenCalledWith(
				"run-1",
				expect.objectContaining({
					metadata: { source: "test", result: "success" },
				}),
			);
		});

		it("should handle missing existing run gracefully", async () => {
			mockRepo.getById.mockResolvedValue(undefined);

			await service.completeRun("run-1", {
				output: "done",
				metadata: { new: "meta" },
			});

			expect(mockRepo.update).toHaveBeenCalledWith(
				"run-1",
				expect.objectContaining({
					metadata: { new: "meta" },
				}),
			);
		});

		it("should include fullInput and fullOutput when provided", async () => {
			mockRepo.getById.mockResolvedValue({ id: "run-1", metadata: {} });

			await service.completeRun("run-1", {
				output: "short output",
				fullInput: "full input text",
				fullOutput: "full output text",
			});

			expect(mockRepo.update).toHaveBeenCalledWith(
				"run-1",
				expect.objectContaining({
					fullInput: "full input text",
					fullOutput: "full output text",
				}),
			);
		});
	});

	describe("failRun", () => {
		it("should update run with failure data", async () => {
			await service.failRun("run-1", "Connection timeout", 5000);

			expect(mockRepo.update).toHaveBeenCalledWith("run-1", {
				status: "failed",
				error: "Connection timeout",
				durationMs: 5000,
				completedAt: "2026-01-15T10:00:00.000Z",
			});
		});

		it("should handle missing durationMs", async () => {
			await service.failRun("run-1", "Unknown error");

			expect(mockRepo.update).toHaveBeenCalledWith(
				"run-1",
				expect.objectContaining({
					status: "failed",
					error: "Unknown error",
				}),
			);
		});
	});

	describe("listAll", () => {
		it("should return runs sorted by createdAt descending", async () => {
			const runs = [
				{ id: "1", createdAt: "2026-01-01T00:00:00Z" },
				{ id: "2", createdAt: "2026-01-03T00:00:00Z" },
				{ id: "3", createdAt: "2026-01-02T00:00:00Z" },
			];
			mockRepo.listAll.mockResolvedValue(runs);

			const result = await service.listAll();

			expect(result[0].id).toBe("2");
			expect(result[1].id).toBe("3");
			expect(result[2].id).toBe("1");
			expect(mockRepo.listAll).toHaveBeenCalledWith(500);
		});

		it("should return empty array when no runs", async () => {
			mockRepo.listAll.mockResolvedValue([]);

			const result = await service.listAll();

			expect(result).toEqual([]);
		});
	});

	describe("listByAgent", () => {
		it("should delegate to repository", async () => {
			const expected = [{ id: "1", agent: "chat" }];
			mockRepo.listByAgent.mockResolvedValue(expected);

			const result = await service.listByAgent("chat");

			expect(result).toEqual(expected);
			expect(mockRepo.listByAgent).toHaveBeenCalledWith("chat");
		});
	});

	describe("getById", () => {
		it("should return run when found", async () => {
			const run = { id: "run-1", agent: "chat" };
			mockRepo.getById.mockResolvedValue(run);

			const result = await service.getById("run-1");

			expect(result).toEqual(run);
		});

		it("should return undefined when not found", async () => {
			mockRepo.getById.mockResolvedValue(undefined);

			const result = await service.getById("non-existent");

			expect(result).toBeUndefined();
		});
	});
});
