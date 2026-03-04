import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfigService } from "../config/config.service";
import { AiPlannerService } from "./ai-planner.service";

// Mock @google/genai
const mockGenerateContent = vi.fn();

vi.mock("@google/genai", () => ({
	GoogleGenAI: class MockGoogleGenAI {
		models = {
			generateContent: mockGenerateContent,
		};
	},
}));

describe("AiPlannerService", () => {
	let service: AiPlannerService;
	const mockConfig = {
		config: {
			KB_BUILDER_URL: "http://localhost:3002",
		},
	} as unknown as AppConfigService;

	beforeEach(() => {
		vi.clearAllMocks();
		process.env.GEMINI_API_KEY = "test-key";
		service = new AiPlannerService(mockConfig);
	});

	describe("generateQuestions", () => {
		it("should return 6 questions for round 1", async () => {
			const mockQuestions = [
				{ id: 1, question: "Is this for internal use only?" },
				{ id: 2, question: "Do you have more than 10 team members?" },
				{ id: 3, question: "Is there a deadline within 3 months?" },
				{ id: 4, question: "Do you need real-time processing?" },
				{ id: 5, question: "Will this handle sensitive data?" },
				{ id: 6, question: "Do you already use AI tools?" },
			];

			mockGenerateContent.mockResolvedValueOnce({
				text: JSON.stringify(mockQuestions),
			});

			const result = await service.generateQuestions(
				"Build a customer support chatbot",
				1,
				[],
			);

			expect(result).toHaveLength(6);
			expect(result[0]).toHaveProperty("id");
			expect(result[0]).toHaveProperty("question");
		});

		it("should pass previous answers in context for rounds 2 and 3", async () => {
			const mockQuestions = Array.from({ length: 6 }, (_, i) => ({
				id: i + 1,
				question: `Follow-up question ${i + 1}?`,
			}));

			mockGenerateContent.mockResolvedValueOnce({
				text: JSON.stringify(mockQuestions),
			});

			const previousAnswers = [
				{ id: 1, question: "Is this internal?", answer: true },
				{ id: 2, question: "Large team?", answer: false },
			];

			const result = await service.generateQuestions(
				"Build a chatbot",
				2,
				previousAnswers,
			);

			expect(result).toHaveLength(6);

			// Verify previous answers were passed to Gemini in the system instruction
			const callArgs = mockGenerateContent.mock.calls[0]?.[0];
			expect(callArgs.config.systemInstruction).toContain("Is this internal?");
			expect(callArgs.config.systemInstruction).toContain("YES");
			expect(callArgs.config.systemInstruction).toContain("NO");
		});

		it("should throw on empty response", async () => {
			mockGenerateContent.mockResolvedValueOnce({ text: "" });

			await expect(
				service.generateQuestions("Build a chatbot", 1, []),
			).rejects.toThrow("Empty response");
		});

		it("should throw if response is not 6 questions", async () => {
			mockGenerateContent.mockResolvedValueOnce({
				text: JSON.stringify([{ id: 1, question: "Only one?" }]),
			});

			await expect(
				service.generateQuestions("Build a chatbot", 1, []),
			).rejects.toThrow("Expected 6 questions");
		});
	});

	describe("generateStrategy", () => {
		it("should generate strategy via Gemini", async () => {
			const mockStrategy = {
				title: "AI-Powered Customer Support",
				summary: "Use ChatGPT to build a customer support chatbot.",
				tool: "chatgpt",
				steps: [
					{
						order: 1,
						title: "Define FAQ",
						description: "Gather common questions.",
						prompt: "You are a customer support agent for ABC Corp...",
					},
				],
			};

			mockGenerateContent.mockResolvedValueOnce({
				text: JSON.stringify(mockStrategy),
			});

			const result = await service.generateStrategy(
				"Build a customer support chatbot",
				[
					{
						id: 1,
						question: "Is this internal?",
						answer: true,
					},
				],
			);

			expect(result.title).toBe("AI-Powered Customer Support");
			expect(result.steps).toHaveLength(1);
			expect(result.tool).toBe("chatgpt");
		});
	});
});


