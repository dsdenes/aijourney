import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PromptOptimizerService } from "./prompt-optimizer.service";

// Mock @google/genai
const mockGenerateContent = vi.fn();

vi.mock("@google/genai", () => ({
	GoogleGenAI: class MockGoogleGenAI {
		models = { generateContent: mockGenerateContent };
	},
}));

describe("PromptOptimizerService", () => {
	let service: PromptOptimizerService;

	beforeEach(() => {
		vi.clearAllMocks();
		process.env.GEMINI_API_KEY = "test-key";
		service = new PromptOptimizerService();
	});

	afterEach(() => {
		delete process.env.GEMINI_API_KEY;
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

			mockGenerateContent.mockResolvedValue({ text: JSON.stringify(mockResponse) });

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

			mockGenerateContent.mockResolvedValue({
				text: "```json\n" + JSON.stringify(mockResponse) + "\n```",
			});

			const result = await service.analyzePrompt("Write code to sort an array");

			expect(result.score).toBe(50);
			expect(result.goals).toHaveLength(3);
		});

		it("should throw on empty Gemini response", async () => {
			mockGenerateContent.mockResolvedValue({ text: "" });

			await expect(service.analyzePrompt("test")).rejects.toThrow(
				"Empty response from Gemini",
			);
		});

		it("should throw on invalid JSON response", async () => {
			mockGenerateContent.mockResolvedValue({ text: "This is not JSON" });

			await expect(service.analyzePrompt("test")).rejects.toThrow(
				"Failed to parse prompt analysis response",
			);
		});

		it("should call Gemini with correct model and token limit", async () => {
			mockGenerateContent.mockResolvedValue({
				text: JSON.stringify({ score: 10, scoreExplanation: "x", goals: [] }),
			});

			await service.analyzePrompt("test prompt");

			expect(mockGenerateContent).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "gemini-3.1-flash-lite-preview",
					config: expect.objectContaining({ maxOutputTokens: 8000 }),
				}),
			);
		});

		it("should include the prompt in the user message", async () => {
			mockGenerateContent.mockResolvedValue({
				text: JSON.stringify({ score: 10, scoreExplanation: "x", goals: [] }),
			});

			await service.analyzePrompt("My specific prompt text");

			const callArgs = mockGenerateContent.mock.calls[0][0];
			const userText = callArgs.contents[0].parts[0].text;
			expect(userText).toContain("My specific prompt text");
		});
	});

	describe("optimizePrompt", () => {
		it("should return optimized prompt with changes and new score", async () => {
			const mockResponse = {
				optimizedPrompt: "You are an expert data analyst...",
				changes: ["Added role", "Added format", "Added constraints"],
				newScore: 88,
			};

			mockGenerateContent.mockResolvedValue({ text: JSON.stringify(mockResponse) });

			const result = await service.optimizePrompt(
				"Analyze this data",
				"Get statistical insights",
			);

			expect(result.optimizedPrompt).toContain("expert data analyst");
			expect(result.changes).toHaveLength(3);
			expect(result.newScore).toBe(88);
		});

		it("should throw on empty response", async () => {
			mockGenerateContent.mockResolvedValue({ text: null });

			await expect(service.optimizePrompt("test", "goal")).rejects.toThrow(
				"Empty response from Gemini",
			);
		});

		it("should throw on invalid JSON in optimization response", async () => {
			mockGenerateContent.mockResolvedValue({ text: "not json" });

			await expect(service.optimizePrompt("test", "goal")).rejects.toThrow(
				"Failed to parse prompt optimization response",
			);
		});

		it("should include original prompt and goal in the request", async () => {
			mockGenerateContent.mockResolvedValue({
				text: JSON.stringify({ optimizedPrompt: "x", changes: [], newScore: 90 }),
			});

			await service.optimizePrompt("Original prompt", "My chosen goal");

			const callArgs = mockGenerateContent.mock.calls[0][0];
			const userText = callArgs.contents[0].parts[0].text;
			expect(userText).toContain("Original prompt");
			expect(userText).toContain("My chosen goal");
		});

		it("should use correct model and token limit for optimization", async () => {
			mockGenerateContent.mockResolvedValue({
				text: JSON.stringify({ optimizedPrompt: "x", changes: [], newScore: 90 }),
			});

			await service.optimizePrompt("test", "goal");

			expect(mockGenerateContent).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "gemini-3.1-flash-lite-preview",
					config: expect.objectContaining({ maxOutputTokens: 8000 }),
				}),
			);
		});

		it("should handle markdown-fenced JSON in optimization response", async () => {
			const response = {
				optimizedPrompt: "Better prompt",
				changes: ["Improved clarity"],
				newScore: 75,
			};

			mockGenerateContent.mockResolvedValue({
				text: "```\n" + JSON.stringify(response) + "\n```",
			});

			const result = await service.optimizePrompt("test", "goal");

			expect(result.newScore).toBe(75);
		});
	});
});


