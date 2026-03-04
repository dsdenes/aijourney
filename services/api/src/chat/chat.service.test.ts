import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentRunsService } from "../agent-runs/agent-runs.service";
import { AppConfigService } from "../config/config.service";
import { QuotaService } from "../quotas/quotas.service";
import { ChatService } from "./chat.service";

// Mock @google/genai
const mockGenerateContent = vi.fn().mockResolvedValue({
	text: "AI tools help improve productivity in many ways.",
	usageMetadata: {
		promptTokenCount: 150,
		candidatesTokenCount: 200,
		totalTokenCount: 350,
	},
});

vi.mock("@google/genai", () => ({
	GoogleGenAI: class MockGoogleGenAI {
		models = { generateContent: mockGenerateContent };
	},
}));

// Save/restore fetch
let originalFetch: typeof globalThis.fetch;

function mockFetch(summaries: unknown[] = [], articles: unknown[] = []) {
	globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
		const urlStr = String(url);
		if (urlStr.includes("/summaries")) {
			return { ok: true, json: async () => ({ data: summaries }) };
		}
		if (urlStr.includes("/articles")) {
			return { ok: true, json: async () => ({ data: articles }) };
		}
		return { ok: false, json: async () => ({}) };
	});
}

const sampleSummary = {
	id: "s1",
	articleId: "a1",
	content: {
		title: "Prompt Engineering Best Practices",
		keyPoints: ["Be specific", "Provide examples"],
		dos: ["Use clear instructions"],
		donts: ["Use vague prompts"],
		tags: ["prompt-engineering", "tools"],
		difficulty: "beginner",
		roleRelevance: [{ role: "engineering", relevanceScore: 0.9 }],
		citations: [{ text: "Be clear", sourceSection: "intro" }],
	},
	model: "gemini-3.1-flash-lite-preview",
	createdAt: "2026-01-01T00:00:00.000Z",
};

const sampleArticle = {
	id: "a1",
	url: "https://example.com/prompts",
	title: "Prompt Engineering",
	source: "example.com",
	status: "summarized",
};

describe("ChatService", () => {
	let service: ChatService;

	beforeEach(async () => {
		originalFetch = globalThis.fetch;
		process.env.GEMINI_API_KEY = "test-key";

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ChatService,
				{
					provide: AppConfigService,
					useValue: { config: { REDIS_URL: "redis://localhost:6379" } },
				},
				{
					provide: AgentRunsService,
					useValue: {
						startRun: vi.fn().mockResolvedValue({ id: "test-run-id" }),
						completeRun: vi.fn().mockResolvedValue(undefined),
						failRun: vi.fn().mockResolvedValue(undefined),
					},
				},
				{
					provide: QuotaService,
					useValue: {
						checkAndIncrement: vi
							.fn()
							.mockResolvedValue({
								allowed: true,
								remainingCalls: 999,
								totalLimit: 1000,
								used: 1,
							}),
						check: vi
							.fn()
							.mockResolvedValue({
								allowed: true,
								remainingCalls: 999,
								totalLimit: 1000,
								used: 1,
							}),
					},
				},
			],
		}).compile();

		service = module.get<ChatService>(ChatService);
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe("chat", () => {
		it("should return an answer with sources and token count", async () => {
			mockFetch([sampleSummary], [sampleArticle]);

			const result = await service.chat("How should I write prompts?");

			expect(result).toMatchObject({
				answer: expect.any(String),
				tokensUsed: 350,
				model: expect.any(String),
			});
			expect(result.sources.length).toBeGreaterThan(0);
			expect(result.sources[0].title).toBe("Prompt Engineering Best Practices");
			expect(result.sources[0].url).toBe("https://example.com/prompts");
		});

		it("should work with empty KB (no summaries)", async () => {
			mockFetch([], []);

			const result = await service.chat("What is AI?");

			expect(result.answer).toBeDefined();
			expect(result.sources).toEqual([]);
			expect(result.tokensUsed).toBe(350);
		});

		it("should handle KB Builder being unavailable", async () => {
			globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

			const result = await service.chat("Test query");

			expect(result.answer).toBeDefined();
			expect(result.sources).toEqual([]);
		});

		it("should pass conversation history to Gemini", async () => {
			mockFetch([sampleSummary], [sampleArticle]);

			const history = [
				{ role: "user" as const, content: "What is prompt engineering?" },
				{
					role: "assistant" as const,
					content: "It's the art of crafting LLM inputs.",
				},
			];

			const result = await service.chat("Tell me more", history);

			expect(result.answer).toBeDefined();
			expect(result.tokensUsed).toBe(350);
		});

		it("should select relevant summaries based on query keywords", async () => {
			const irrelevantSummary = {
				...sampleSummary,
				id: "s2",
				articleId: "a2",
				content: {
					...sampleSummary.content,
					title: "Finance Reporting Methods",
					tags: ["finance"],
					keyPoints: ["Use quarterly reports"],
				},
			};
			mockFetch(
				[sampleSummary, irrelevantSummary],
				[sampleArticle, { ...sampleArticle, id: "a2" }],
			);

			const result = await service.chat("prompt engineering best practices");

			// Should include at least the relevant summary as a source
			const titles = result.sources.map((s) => s.title);
			expect(titles).toContain("Prompt Engineering Best Practices");
		});

		it("should throw if GEMINI_API_KEY is not set", async () => {
			delete process.env.GEMINI_API_KEY;
			mockFetch([], []);

			// Create a fresh service without the key
			const module = await Test.createTestingModule({
				providers: [
					ChatService,
					{
						provide: AppConfigService,
						useValue: { config: { REDIS_URL: "redis://localhost:6379" } },
					},
					{
						provide: AgentRunsService,
						useValue: {
							startRun: vi.fn().mockResolvedValue({ id: "test-run-id" }),
							completeRun: vi.fn().mockResolvedValue(undefined),
							failRun: vi.fn().mockResolvedValue(undefined),
						},
					},
					{
						provide: QuotaService,
						useValue: {
							checkAndIncrement: vi
								.fn()
								.mockResolvedValue({
									allowed: true,
									remainingCalls: 999,
									totalLimit: 1000,
									used: 1,
								}),
							check: vi
								.fn()
								.mockResolvedValue({
									allowed: true,
									remainingCalls: 999,
									totalLimit: 1000,
									used: 1,
								}),
						},
					},
				],
			}).compile();

			const freshService = module.get<ChatService>(ChatService);

			await expect(freshService.chat("test")).rejects.toThrow("GEMINI_API_KEY");
		});
	});

	describe("technicalSteps", () => {
		it("should include RAG provider step in response", async () => {
			mockFetch([sampleSummary], [sampleArticle]);

			const result = await service.chat("How do I use AI?");

			expect(result.technicalSteps).toBeDefined();
			expect(result.technicalSteps!.length).toBeGreaterThan(0);
			// Should mention the RAG provider
			const ragStep = result.technicalSteps!.find((s) =>
				s.includes("RAG provider"),
			);
			expect(ragStep).toBeDefined();
		});

		it("should include Gemini model name in technical steps", async () => {
			mockFetch([sampleSummary], [sampleArticle]);

			const result = await service.chat("What is prompt engineering?");

			const modelStep = result.technicalSteps!.find((s) =>
				s.includes("Gemini"),
			);
			expect(modelStep).toBeDefined();
		});

		it("should include token usage breakdown in technical steps", async () => {
			mockFetch([sampleSummary], [sampleArticle]);

			const result = await service.chat("Tell me about AI tools");

			const tokenStep = result.technicalSteps!.find((s) =>
				s.toLowerCase().includes("tokens"),
			);
			expect(tokenStep).toBeDefined();
		});

		it("should include source count in technical steps", async () => {
			mockFetch([sampleSummary], [sampleArticle]);

			const result = await service.chat("prompt engineering");

			const sourceStep = result.technicalSteps!.find(
				(s) => s.includes("source") || s.includes("keyword"),
			);
			expect(sourceStep).toBeDefined();
		});

		it("should include conversation history count in technical steps", async () => {
			mockFetch([sampleSummary], [sampleArticle]);

			const history = [
				{ role: "user" as const, content: "Hello" },
				{ role: "assistant" as const, content: "Hi there" },
			];

			const result = await service.chat("Follow up question", history);

			const historyStep = result.technicalSteps!.find((s) =>
				s.includes("previous messages"),
			);
			expect(historyStep).toBeDefined();
			expect(historyStep).toContain("2");
		});
	});

	describe("response fields", () => {
		it("should include promptTokens and completionTokens in response", async () => {
			mockFetch([sampleSummary], [sampleArticle]);

			const result = await service.chat("Test query");

			expect(result.promptTokens).toBeDefined();
			expect(result.completionTokens).toBeDefined();
			expect(typeof result.promptTokens).toBe("number");
			expect(typeof result.completionTokens).toBe("number");
		});

		it("should include fullInput and fullOutput in response", async () => {
			mockFetch([sampleSummary], [sampleArticle]);

			const result = await service.chat("Test query");

			expect(result.fullInput).toBeDefined();
			expect(result.fullOutput).toBeDefined();
			// fullInput should be JSON (the messages array)
			expect(() => JSON.parse(result.fullInput!)).not.toThrow();
		});

		it("should include model in response", async () => {
			mockFetch([sampleSummary], [sampleArticle]);

			const result = await service.chat("Test");

			expect(result.model).toBeDefined();
			expect(typeof result.model).toBe("string");
		});
	});
});
