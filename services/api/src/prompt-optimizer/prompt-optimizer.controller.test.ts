import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryService } from "../memory/memory.service";
import { PromptOptimizerController } from "./prompt-optimizer.controller";
import { PromptOptimizerService } from "./prompt-optimizer.service";

const mockMemoryService = {
	enqueueExtraction: vi.fn().mockResolvedValue(undefined),
};

describe("PromptOptimizerController", () => {
	let controller: PromptOptimizerController;

	const mockAnalyzeResult = {
		score: 25,
		scoreExplanation: "The prompt is vague and lacks context.",
		goals: [
			{
				id: 1,
				label: "Get a summary of a topic",
				description: "Summarize a given subject",
			},
			{
				id: 2,
				label: "Generate creative content",
				description: "Create engaging text",
			},
			{
				id: 3,
				label: "Analyze data patterns",
				description: "Find insights in data",
			},
		],
	};

	const mockOptimizeResult = {
		optimizedPrompt:
			"You are an expert data analyst. Analyze the following dataset...",
		changes: ["Added expert role", "Added output format", "Added constraints"],
		newScore: 85,
	};

	const mockService = {
		analyzePrompt: vi.fn(),
		optimizePrompt: vi.fn(),
	};

	beforeEach(async () => {
		vi.clearAllMocks();

		const module: TestingModule = await Test.createTestingModule({
			controllers: [PromptOptimizerController],
			providers: [
				{ provide: PromptOptimizerService, useValue: mockService },
				{ provide: MemoryService, useValue: mockMemoryService },
			],
		}).compile();

		controller = module.get<PromptOptimizerController>(
			PromptOptimizerController,
		);
	});

	describe("analyze", () => {
		it("should return analysis result wrapped in data envelope", async () => {
			mockService.analyzePrompt.mockResolvedValue(mockAnalyzeResult);

			const result = await controller.analyze({ prompt: "Tell me about AI" });

			expect(result).toEqual({ data: mockAnalyzeResult });
			expect(mockService.analyzePrompt).toHaveBeenCalledWith(
				"Tell me about AI",
			);
		});

		it("should propagate service errors", async () => {
			mockService.analyzePrompt.mockRejectedValue(
				new Error("OpenAI unavailable"),
			);

			await expect(controller.analyze({ prompt: "test" })).rejects.toThrow(
				"OpenAI unavailable",
			);
		});
	});

	describe("optimize", () => {
		it("should return optimization result wrapped in data envelope", async () => {
			mockService.optimizePrompt.mockResolvedValue(mockOptimizeResult);

			const result = await controller.optimize({
				prompt: "Tell me about AI",
				goal: "Get a summary of a topic",
			});

			expect(result).toEqual({ data: mockOptimizeResult });
			expect(mockService.optimizePrompt).toHaveBeenCalledWith(
				"Tell me about AI",
				"Get a summary of a topic",
			);
		});

		it("should propagate service errors", async () => {
			mockService.optimizePrompt.mockRejectedValue(new Error("Rate limited"));

			await expect(
				controller.optimize({ prompt: "test", goal: "test goal" }),
			).rejects.toThrow("Rate limited");
		});
	});
});
