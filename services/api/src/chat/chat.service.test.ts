import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatService } from "./chat.service";
import { AppConfigService } from "../config/config.service";
import { AgentRunsService } from "../agent-runs/agent-runs.service";

// Mock OpenAI module
vi.mock("openai", () => {
	const mockCreate = vi.fn().mockResolvedValue({
		choices: [
			{
				message: {
					content: "AI tools help improve productivity in many ways.",
				},
			},
		],
		usage: { total_tokens: 350 },
	});
	return {
		default: class OpenAI {
			chat = { completions: { create: mockCreate } };
		},
	};
});

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
	model: "gpt-5-mini",
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
		process.env.OPENAI_API_KEY = "test-key";

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

		it("should pass conversation history to OpenAI", async () => {
			mockFetch([sampleSummary], [sampleArticle]);

			const history = [
				{ role: "user" as const, content: "What is prompt engineering?" },
				{ role: "assistant" as const, content: "It's the art of crafting LLM inputs." },
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

		it("should throw if OPENAI_API_KEY is not set", async () => {
			delete process.env.OPENAI_API_KEY;
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
				],
			}).compile();

			const freshService = module.get<ChatService>(ChatService);

			await expect(freshService.chat("test")).rejects.toThrow(
				"OPENAI_API_KEY",
			);
		});
	});
});
