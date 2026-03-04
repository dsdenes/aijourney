import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryService } from "../memory/memory.service";
import { AiPlannerController } from "./ai-planner.controller";
import type { AiPlannerService } from "./ai-planner.service";

describe("AiPlannerController", () => {
	let controller: AiPlannerController;
	const mockService = {
		generateQuestions: vi.fn(),
		generateStrategy: vi.fn(),
	} as unknown as AiPlannerService;

	const mockMemoryService = {
		enqueueExtraction: vi.fn().mockResolvedValue(undefined),
	} as unknown as MemoryService;

	beforeEach(() => {
		vi.clearAllMocks();
		controller = new AiPlannerController(mockService, mockMemoryService);
	});

	describe("POST /ai-planner/questions", () => {
		it("should return validation error for empty goal", async () => {
			const result = await controller.generateQuestions({
				goal: "",
				round: 1,
			});
			expect(result).toHaveProperty("error");
			expect((result as { error: { code: string } }).error.code).toBe(
				"VALIDATION",
			);
		});

		it("should return validation error for invalid round", async () => {
			const result = await controller.generateQuestions({
				goal: "Build a chatbot",
				round: 5 as never,
			});
			expect(result).toHaveProperty("error");
		});

		it("should return questions on success", async () => {
			const mockQuestions = Array.from({ length: 6 }, (_, i) => ({
				id: i + 1,
				question: `Question ${i + 1}?`,
			}));
			(mockService.generateQuestions as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockQuestions,
			);

			const result = await controller.generateQuestions({
				goal: "Build a chatbot",
				round: 1,
			});
			expect(result).toEqual({
				data: { round: 1, questions: mockQuestions },
			});
		});

		it("should return error on service failure", async () => {
			(mockService.generateQuestions as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error("OpenAI down"),
			);

			const result = await controller.generateQuestions({
				goal: "Build a chatbot",
				round: 1,
			});
			expect(result).toHaveProperty("error");
			expect((result as { error: { message: string } }).error.message).toBe(
				"OpenAI down",
			);
		});
	});

	describe("POST /ai-planner/strategy", () => {
		it("should return validation error for empty goal", async () => {
			const result = await controller.generateStrategy({
				goal: "",
				answers: [],
			});
			expect(result).toHaveProperty("error");
		});

		it("should return validation error for empty answers", async () => {
			const result = await controller.generateStrategy({
				goal: "Build a chatbot",
				answers: [],
			});
			expect(result).toHaveProperty("error");
			expect(
				(result as { error: { code: string } }).error.code,
			).toBe("VALIDATION");
		});

		it("should return strategy on success", async () => {
			const mockStrategy = {
				title: "AI Support Strategy",
				summary: "Use AI for support.",
				steps: [
					{
						order: 1,
						title: "Setup",
						description: "Set up ChatGPT.",
						aiRole: "Generates responses.",
					},
				],
				examplePrompt: "You are a helpful assistant...",
				recommendedTools: [
					{ name: "ChatGPT", description: "Primary tool" },
				],
				tips: ["Start small"],
			};
			(mockService.generateStrategy as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockStrategy,
			);

			const result = await controller.generateStrategy({
				goal: "Build a chatbot",
				answers: [
					{
						id: 1,
						question: "Internal?",
						answer: true,
					},
				],
			});
			expect(result).toEqual({ data: mockStrategy });
		});

		it("should return error on service failure", async () => {
			(mockService.generateStrategy as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error("Strategy failed"),
			);

			const result = await controller.generateStrategy({
				goal: "Build a chatbot",
				answers: [
					{
						id: 1,
						question: "Internal?",
						answer: true,
					},
				],
			});
			expect(result).toHaveProperty("error");
		});
	});
});
