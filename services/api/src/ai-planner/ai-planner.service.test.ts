import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfigService } from "../config/config.service";
import { AiPlannerService } from "./ai-planner.service";

// Mock OpenAI
vi.mock("openai", () => {
	return {
		default: class MockOpenAI {
			chat = {
				completions: {
					create: vi.fn(),
				},
			};
		},
	};
});

describe("AiPlannerService", () => {
	let service: AiPlannerService;
	const mockConfig = {
		config: {
			KB_BUILDER_URL: "http://localhost:3002",
		},
	} as unknown as AppConfigService;

	beforeEach(() => {
		process.env.OPENAI_API_KEY = "test-key";
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

			// Access private field to set mock
			const openai = (
				service as unknown as { getOpenAI: () => unknown }
			).getOpenAI() as {
				chat: { completions: { create: ReturnType<typeof vi.fn> } };
			};
			openai.chat.completions.create.mockResolvedValueOnce({
				choices: [
					{
						message: {
							content: JSON.stringify(mockQuestions),
						},
					},
				],
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

			const openai = (
				service as unknown as { getOpenAI: () => unknown }
			).getOpenAI() as {
				chat: { completions: { create: ReturnType<typeof vi.fn> } };
			};
			openai.chat.completions.create.mockResolvedValueOnce({
				choices: [
					{
						message: {
							content: JSON.stringify(mockQuestions),
						},
					},
				],
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

			// Verify previous answers were passed to OpenAI
			const callArgs = openai.chat.completions.create.mock.calls[0]?.[0];
			expect(callArgs.messages[0].content).toContain("Is this internal?");
			expect(callArgs.messages[0].content).toContain("YES");
			expect(callArgs.messages[0].content).toContain("NO");
		});

		it("should throw on empty response", async () => {
			const openai = (
				service as unknown as { getOpenAI: () => unknown }
			).getOpenAI() as {
				chat: { completions: { create: ReturnType<typeof vi.fn> } };
			};
			openai.chat.completions.create.mockResolvedValueOnce({
				choices: [{ message: { content: "" } }],
			});

			await expect(
				service.generateQuestions("Build a chatbot", 1, []),
			).rejects.toThrow("Empty response");
		});

		it("should throw if response is not 6 questions", async () => {
			const openai = (
				service as unknown as { getOpenAI: () => unknown }
			).getOpenAI() as {
				chat: { completions: { create: ReturnType<typeof vi.fn> } };
			};
			openai.chat.completions.create.mockResolvedValueOnce({
				choices: [
					{
						message: {
							content: JSON.stringify([{ id: 1, question: "Only one?" }]),
						},
					},
				],
			});

			await expect(
				service.generateQuestions("Build a chatbot", 1, []),
			).rejects.toThrow("Expected 6 questions");
		});
	});

	describe("generateStrategy", () => {
		it("should generate strategy via OpenAI", async () => {
			const mockStrategy = {
				title: "AI-Powered Customer Support",
				summary: "Use ChatGPT to build a customer support chatbot.",
				tool: "ChatGPT",
				steps: [
					{
						order: 1,
						title: "Define FAQ",
						description: "Gather common questions.",
						aiRole: "AI categorizes questions.",
						prompt: "You are a customer support agent for ABC Corp...",
					},
				],
				examplePrompt: "You are a customer support agent for ABC Corp...",
				recommendedTools: [
					{
						name: "ChatGPT",
						description: "Primary conversational AI",
						url: "https://chat.openai.com",
					},
				],
				tips: ["Start small", "Test frequently", "Iterate"],
			};

			const openai = (
				service as unknown as { getOpenAI: () => unknown }
			).getOpenAI() as {
				chat: { completions: { create: ReturnType<typeof vi.fn> } };
			};
			openai.chat.completions.create.mockResolvedValueOnce({
				choices: [
					{
						message: {
							content: JSON.stringify(mockStrategy),
						},
					},
				],
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
			expect(result.tool).toBe("ChatGPT");
		});
	});
});
