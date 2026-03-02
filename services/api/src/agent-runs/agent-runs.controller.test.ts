import { Test, type TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentRunsController } from "./agent-runs.controller";
import { AgentRunsService } from "./agent-runs.service";

describe("AgentRunsController", () => {
	let controller: AgentRunsController;
	let service: AgentRunsService;

	const mockRun = {
		id: "run-1",
		agent: "chat" as const,
		status: "completed" as const,
		input: "test question",
		output: "test answer",
		createdAt: "2026-01-01T00:00:00.000Z",
		completedAt: "2026-01-01T00:00:01.000Z",
		tokensUsed: 100,
		promptTokens: 60,
		completionTokens: 40,
		durationMs: 1200,
	};

	const mockService = {
		listAll: vi.fn(),
		listByAgent: vi.fn(),
		getById: vi.fn(),
		startRun: vi.fn(),
		completeRun: vi.fn(),
		failRun: vi.fn(),
	};

	beforeEach(async () => {
		vi.clearAllMocks();

		const module: TestingModule = await Test.createTestingModule({
			controllers: [AgentRunsController],
			providers: [
				{ provide: AgentRunsService, useValue: mockService },
			],
		}).compile();

		controller = module.get<AgentRunsController>(AgentRunsController);
		service = module.get<AgentRunsService>(AgentRunsService);
	});

	describe("listAll", () => {
		it("should return all runs when no agent filter", async () => {
			mockService.listAll.mockResolvedValue([mockRun]);

			const result = await controller.listAll();

			expect(result).toEqual({ data: [mockRun] });
			expect(mockService.listAll).toHaveBeenCalledOnce();
			expect(mockService.listByAgent).not.toHaveBeenCalled();
		});

		it("should filter by agent type when provided", async () => {
			mockService.listByAgent.mockResolvedValue([mockRun]);

			const result = await controller.listAll("chat");

			expect(result).toEqual({ data: [mockRun] });
			expect(mockService.listByAgent).toHaveBeenCalledWith("chat");
			expect(mockService.listAll).not.toHaveBeenCalled();
		});

		it("should fall back to listAll for invalid agent type", async () => {
			mockService.listAll.mockResolvedValue([mockRun]);

			const result = await controller.listAll("invalid-agent");

			expect(result).toEqual({ data: [mockRun] });
			expect(mockService.listAll).toHaveBeenCalledOnce();
		});

		it("should return empty array when no runs exist", async () => {
			mockService.listAll.mockResolvedValue([]);

			const result = await controller.listAll();

			expect(result).toEqual({ data: [] });
		});
	});

	describe("getOne", () => {
		it("should return a run by ID", async () => {
			mockService.getById.mockResolvedValue(mockRun);

			const result = await controller.getOne("run-1");

			expect(result).toEqual({ data: mockRun });
			expect(mockService.getById).toHaveBeenCalledWith("run-1");
		});

		it("should return NOT_FOUND error when run does not exist", async () => {
			mockService.getById.mockResolvedValue(undefined);

			const result = await controller.getOne("non-existent");

			expect(result).toEqual({
				error: {
					code: "NOT_FOUND",
					message: "Agent run non-existent not found",
				},
			});
		});
	});
});
