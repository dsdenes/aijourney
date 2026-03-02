import { describe, expect, it, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

// Mock dependencies
vi.mock("./article-repository.js", () => ({
	getArticlesByStatus: vi.fn(),
	updateArticleStatus: vi.fn(),
}));

vi.mock("./summary-repository.js", () => ({
	getSummaryByArticleId: vi.fn(),
}));

vi.mock("./log-stream.js", () => ({
	log: vi.fn(),
}));

// Helper to create a mock spawn child process
let mockSpawnResult: { stdout: string; stderr: string; code: number } = {
	stdout: "[]", stderr: "", code: 0,
};

vi.mock("node:child_process", () => ({
	spawn: vi.fn(() => {
		const child = new EventEmitter() as any;
		child.stdout = new EventEmitter();
		child.stderr = new EventEmitter();
		child.stdin = { write: vi.fn(), end: vi.fn() };

		// Emit the data async to simulate real behavior
		setTimeout(() => {
			if (mockSpawnResult.stderr) {
				child.stderr.emit("data", Buffer.from(mockSpawnResult.stderr));
			}
			child.stdout.emit("data", Buffer.from(mockSpawnResult.stdout));
			child.emit("close", mockSpawnResult.code);
		}, 0);

		return child;
	}),
}));

// Mock OpenAI
vi.mock("openai", () => {
	const mockCreate = vi.fn();
	return {
		default: class {
			embeddings = { create: mockCreate };
		},
		__mockEmbeddingsCreate: mockCreate,
	};
});

// Mock global fetch for Qdrant
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { getArticlesByStatus, updateArticleStatus } from "./article-repository.js";
import { getSummaryByArticleId } from "./summary-repository.js";
import { spawn } from "node:child_process";
import { __mockEmbeddingsCreate } from "openai";

// We need to import after mocks
const { runRagIngestion, ensureCollection, chunkDocuments } = await import("./rag-ingestor.js");

describe("RAG Ingestor", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.OPENAI_API_KEY = "sk-test-key";
	});

	describe("ensureCollection", () => {
		it("should check if collection exists and skip creation if present", async () => {
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ result: { points_count: 100 } }),
			});

			await ensureCollection();

			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining("/collections/kb_chunks"),
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("should create collection when it does not exist", async () => {
			fetchMock
				.mockResolvedValueOnce({ ok: false, text: async () => "Not found", status: 404 })
				.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

			await ensureCollection();

			expect(fetchMock).toHaveBeenCalledTimes(2);
			const [, [url, opts]] = fetchMock.mock.calls;
			expect(url).toContain("/collections/kb_chunks");
			expect(opts.method).toBe("PUT");
			const body = JSON.parse(opts.body);
			expect(body.vectors.size).toBe(1536);
			expect(body.vectors.distance).toBe("Cosine");
		});
	});

	describe("chunkDocuments", () => {
		it("should call spawn with JSON input and parse output", async () => {
			const mockOutput = [
				{ doc_id: "a1", index: 0, text: "Hello world", start: 0, end: 11 },
			];
			mockSpawnResult = {
				stdout: JSON.stringify(mockOutput),
				stderr: "",
				code: 0,
			};

			const result = await chunkDocuments([
				{ id: "a1", text: "Hello world", chunk_size: 800, overlap: 150 },
			]);

			expect(result).toEqual(mockOutput);
			expect(spawn).toHaveBeenCalledWith(
				expect.stringContaining("chunker"),
				[],
				expect.any(Object),
			);
		});
	});

	describe("runRagIngestion", () => {
		it("should return early when no summarized articles exist", async () => {
			vi.mocked(getArticlesByStatus).mockResolvedValue([]);

			const result = await runRagIngestion();

			expect(result.ingested).toBe(0);
			expect(result.totalChunks).toBe(0);
			expect(result.errors).toHaveLength(0);
		});

		it("should skip articles without summaries", async () => {
			vi.mocked(getArticlesByStatus).mockImplementation(async (status) => {
				if (status === "summarized") return [
					{ id: "a1", title: "Test Article", url: "http://test.com", source: "test", status: "summarized" } as any,
				];
				return [];
			});
			vi.mocked(getSummaryByArticleId).mockResolvedValue(null);

			// Mock ensureCollection
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ result: { points_count: 0 } }),
			});

			const result = await runRagIngestion();

			expect(result.ingested).toBe(0);
			expect(result.errors).toContain("No summary found for article a1");
		});

		it("should process articles through chunk → embed → upsert pipeline", async () => {
			const mockArticle = {
				id: "a1", title: "AI Best Practices", url: "http://test.com/ai",
				source: "blog", status: "summarized", crawledAt: "2025-01-01",
			};
			const mockSummary = {
				id: "s1", articleId: "a1", model: "gpt-5-mini", createdAt: "2025-01-01",
				content: {
					title: "AI Best Practices",
					keyPoints: ["Use AI wisely"],
					dos: ["Test outputs"],
					donts: ["Trust blindly"],
					tags: ["ai", "testing"],
					difficulty: "beginner",
					roleRelevance: [],
					citations: [],
				},
			};

			vi.mocked(getArticlesByStatus).mockImplementation(async (status) => {
				if (status === "summarized") return [mockArticle as any];
				return [];
			});
			vi.mocked(getSummaryByArticleId).mockResolvedValue(mockSummary as any);
			vi.mocked(updateArticleStatus).mockResolvedValue(undefined);

			// Mock ensureCollection (GET succeeds)
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ result: { points_count: 0 } }),
			});

			// Mock chunker via spawn
			const mockChunks = [
				{ doc_id: "a1", index: 0, text: "AI Best Practices\nUse AI wisely", start: 0, end: 30 },
				{ doc_id: "a1", index: 1, text: "Test outputs\nDon't trust blindly", start: 20, end: 52 },
			];
			mockSpawnResult = {
				stdout: JSON.stringify(mockChunks),
				stderr: "",
				code: 0,
			};

			// Mock OpenAI embeddings
			(vi.mocked(__mockEmbeddingsCreate) as any).mockResolvedValue({
				data: [
					{ index: 0, embedding: Array(1536).fill(0.1) },
					{ index: 1, embedding: Array(1536).fill(0.2) },
				],
				usage: { total_tokens: 50 },
			});

			// Mock Qdrant upsert
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ result: { status: "ok" } }),
			});

			const result = await runRagIngestion();

			expect(result.ingested).toBe(1);
			expect(result.totalChunks).toBe(2);
			expect(result.totalTokensUsed).toBe(50);
			expect(result.errors).toHaveLength(0);
			expect(updateArticleStatus).toHaveBeenCalledWith("a1", "ingested");
		});
	});
});
