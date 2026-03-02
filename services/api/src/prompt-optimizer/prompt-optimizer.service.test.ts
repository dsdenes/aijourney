import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PromptOptimizerService } from "./prompt-optimizer.service";

// Mock OpenAI
const mockCreate = vi.fn();

vi.mock("openai", () => ({
	default: class OpenAI {
		chat = { completions: { create: mockCreate } };
	},
}));

describe("PromptOptimizerService", () => {
	let service: PromptOptimizerService;

	beforeEach(() => {
		vi.clearAllMocks();
		process.env.OPENAI_API_KEY = "test-key";
		service = new PromptOptimizerService();
	});

	afterEach(() => {
		delete process.env.OPENAI_API_KEY;
	});

	describe("analyzePrompt", () => {
		it("should return parsed analysis with score and goals", async () => {
			const mockResponse = {
				score: 30,
				scoreExplanation: "The prompt lacks specificity.",
				goals: [
					{
						id: 1,
						label: "Summarize a topic",
						description: "Get a concise overview",
					},
					{ id: 2, label: "Generate content", description: "Create new text" },
					{
						id: 3,
						label: "Explain concept",
						description: "Break down a complex idea",
					},
				],
			};

			mockCreate.mockResolvedValue({
				choices: [{ message: { content: JSON.stringify(mockResponse) } }],
			});

			const result = await service.analyzePrompt("Tell me about AI");

			expect(result.score).toBe(30);
			expect(result.scoreExplanation).toBe("The prompt lacks specificity.");
			expect(result.goals).toHaveLength(3);
			expect(result.goals[0].label).toBe("Summarize a topic");
		});

		it("should handle markdown-fenced JSON responses", async () => {
			const mockResponse = {
				score: 50,
				scoreExplanation: "Decent but could be better.",
				goals: [
					{ id: 1, label: "Goal 1", description: "Desc 1" },
					{ id: 2, label: "Goal 2", description: "Desc 2" },
					{ id: 3, label: "Goal 3", description: "Desc 3" },
				],
			};

			mockCreate.mockResolvedValue({
				choices: [
					{
						message: {
							content: "```json\n" + JSON.stringify(mockResponse) + "\n```",
						},
					},
				],
			});

			const result = await service.analyzePrompt("Write code to sort an array");

			expect(result.score).toBe(50);
			expect(result.goals).toHaveLength(3);
		});

		it("should throw on empty OpenAI response", async () => {
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: "" } }],
			});

			await expect(service.analyzePrompt("test")).rejects.toThrow(
				"Empty response from OpenAI",
			);
		});

		it("should throw on invalid JSON response", async () => {
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: "This is not JSON" } }],
			});

			await expect(service.analyzePrompt("test")).rejects.toThrow(
				"Failed to parse prompt analysis response",
			);
		});

		it("should call OpenAI with correct model and temperature", async () => {
			mockCreate.mockResolvedValue({
				choices: [
					{
						message: {
							content: JSON.stringify({
								score: 10,
								scoreExplanation: "x",
								goals: [],
							}),
						},
					},
				],
			});

			await service.analyzePrompt("test prompt");

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "gpt-5-mini",
					temperature: 0.4,
					max_tokens: 500,
				}),
			);
		});

		it("should include the prompt in the user message", async () => {
			mockCreate.mockResolvedValue({
				choices: [
					{
						message: {
							content: JSON.stringify({
								score: 10,
								scoreExplanation: "x",
								goals: [],
							}),
						},
					},
				],
			});

			await service.analyzePrompt("My specific prompt text");

			const callArgs = mockCreate.mock.calls[0][0];
			const userMsg = callArgs.messages.find((m: any) => m.role === "user");
			expect(userMsg.content).toContain("My specific prompt text");
		});
	});

	describe("optimizePrompt", () => {
		it("should return optimized prompt with changes and new score", async () => {
			const mockResponse = {
				optimizedPrompt: "You are an expert data analyst...",
				changes: ["Added role", "Added format", "Added constraints"],
				newScore: 88,
			};

			mockCreate.mockResolvedValue({
				choices: [{ message: { content: JSON.stringify(mockResponse) } }],
			});

			const result = await service.optimizePrompt(
				"Analyze this data",
				"Get statistical insights",
			);

			expect(result.optimizedPrompt).toContain("expert data analyst");
			expect(result.changes).toHaveLength(3);
			expect(result.newScore).toBe(88);
		});

		it("should throw on empty response", async () => {
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: null } }],
			});

			await expect(service.optimizePrompt("test", "goal")).rejects.toThrow(
				"Empty response from OpenAI",
			);
		});

		it("should throw on invalid JSON in optimization response", async () => {
			mockCreate.mockResolvedValue({
				choices: [{ message: { content: "not json" } }],
			});

			await expect(service.optimizePrompt("test", "goal")).rejects.toThrow(
				"Failed to parse prompt optimization response",
			);
		});

		it("should include original prompt and goal in the request", async () => {
			mockCreate.mockResolvedValue({
				choices: [
					{
						message: {
							content: JSON.stringify({
								optimizedPrompt: "x",
								changes: [],
								newScore: 90,
							}),
						},
					},
				],
			});

			await service.optimizePrompt("Original prompt", "My chosen goal");

			const callArgs = mockCreate.mock.calls[0][0];
			const userMsg = callArgs.messages.find((m: any) => m.role === "user");
			expect(userMsg.content).toContain("Original prompt");
			expect(userMsg.content).toContain("My chosen goal");
		});

		it("should use correct model and temperature for optimization", async () => {
			mockCreate.mockResolvedValue({
				choices: [
					{
						message: {
							content: JSON.stringify({
								optimizedPrompt: "x",
								changes: [],
								newScore: 90,
							}),
						},
					},
				],
			});

			await service.optimizePrompt("test", "goal");

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "gpt-5-mini",
					temperature: 0.5,
					max_tokens: 1500,
				}),
			);
		});

		it("should handle markdown-fenced JSON in optimization response", async () => {
			const response = {
				optimizedPrompt: "Better prompt",
				changes: ["Improved clarity"],
				newScore: 75,
			};

			mockCreate.mockResolvedValue({
				choices: [
					{
						message: { content: "```\n" + JSON.stringify(response) + "\n```" },
					},
				],
			});

			const result = await service.optimizePrompt("test", "goal");

			expect(result.newScore).toBe(75);
		});
	});
});
