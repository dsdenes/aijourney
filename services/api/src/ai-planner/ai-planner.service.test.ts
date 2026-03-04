import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfigService } from "../config/config.service";
import { AiPlannerService } from "./ai-planner.service";

// Mock openai (xAI Grok uses OpenAI-compatible SDK)
const mockCreate = vi.fn();

vi.mock("openai", () => ({
	default: class OpenAI {
		chat = { completions: { create: mockCreate } };
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
		process.env.GROK_API_KEY = "test-key";
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

			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify(mockQuestions) } }],
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

			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify(mockQuestions) } }],
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

			// Verify previous answers were passed to Grok in the system message
			const callArgs = mockCreate.mock.calls[0]?.[0];
			const systemMsg = callArgs.messages.find((m: any) => m.role === "system");
			expect(systemMsg.content).toContain("Is this internal?");
			expect(systemMsg.content).toContain("YES");
			expect(systemMsg.content).toContain("NO");
		});

		it("should throw on empty response", async () => {
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: "" } }],
			});

			await expect(
				service.generateQuestions("Build a chatbot", 1, []),
			).rejects.toThrow("Empty response");
		});

		it("should throw if response is not 6 questions", async () => {
			mockCreate.mockResolvedValueOnce({
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
		it("should generate strategy via Grok and enhance last step with gpt-5.2", async () => {
			process.env.OPENAI_API_KEY = "test-openai-key";

			const mockStrategy = {
				title: "AI-Powered Customer Support",
				summary: "Use ChatGPT to build a customer support chatbot.",
				startingState: "You have a list of common customer questions.",
				endResult: "A complete FAQ document.",
				nextSteps: "Share the FAQ with your team.",
				tool: "chatgpt",
				steps: [
					{
						order: 1,
						title: "Define FAQ",
						description: "Gather common questions.",
						inputArtifacts: "Your list of customer questions",
						outputArtifacts: "A structured FAQ draft — save it for the next step",
						prompt: "You are a customer support agent for ABC Corp...",
					},
					{
						order: 2,
						title: "Polish FAQ",
						description: "Refine the FAQ.",
						inputArtifacts: "The FAQ draft from Step 1",
						outputArtifacts: "A polished FAQ ready to share",
						prompt: "Take this FAQ draft and make it professional...",
					},
				],
			};

			const enhancedLastStep = {
				order: 2,
				title: "Polish & Finalize FAQ",
				description: "Create a professional, ready-to-publish FAQ.",
				inputArtifacts: "The FAQ draft from Step 1",
				outputArtifacts: "A polished FAQ document — copy it into a Google Doc and share with your team",
				prompt: "You are a professional editor. Take this FAQ draft and...",
			};

			// First call: Grok generates the strategy
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify(mockStrategy) } }],
			});

			// Second call: gpt-5.2 enhances the last step
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify(enhancedLastStep) } }],
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
			expect(result.steps).toHaveLength(2);
			expect(result.tool).toBe("chatgpt");
			expect(result.startingState).toBe("You have a list of common customer questions.");
			expect(result.endResult).toBe("A complete FAQ document.");
			// The last step should be the enhanced version
			expect(result.steps[1]?.title).toBe("Polish & Finalize FAQ");

			// Verify gpt-5.2 was called for the last step
			expect(mockCreate).toHaveBeenCalledTimes(2);
			const secondCall = mockCreate.mock.calls[1]?.[0];
			expect(secondCall.model).toBe("gpt-5.2");
			expect(secondCall.reasoning).toEqual({ effort: "high" });
		});

		it("should fall back to Grok last step when OPENAI_API_KEY is missing", async () => {
			delete process.env.OPENAI_API_KEY;

			const mockStrategy = {
				title: "Simple Plan",
				summary: "A one-step plan.",
				startingState: "Nothing",
				endResult: "Something",
				nextSteps: "Use it",
				tool: "chatgpt",
				steps: [
					{
						order: 1,
						title: "Do it",
						description: "Just do it.",
						inputArtifacts: "Nothing",
						outputArtifacts: "The result",
						prompt: "Help me do the thing...",
					},
				],
			};

			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify(mockStrategy) } }],
			});

			const result = await service.generateStrategy(
				"Simple task",
				[{ id: 1, question: "Quick?", answer: true }],
			);

			// Should still work — just uses the Grok version of the last step
			expect(result.steps[0]?.title).toBe("Do it");
			expect(mockCreate).toHaveBeenCalledTimes(1);
		});
	});
});
