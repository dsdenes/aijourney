import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
	stdout: "[]",
	stderr: "",
	code: 0,
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

// Mock Pinecone SDK
const mockUpsertRecords = vi.fn().mockResolvedValue(undefined);
const mockDescribeIndex = vi.fn().mockResolvedValue({
	status: { state: "Ready" },
	dimension: 1024,
	metric: "cosine",
});

vi.mock("@pinecone-database/pinecone", () => ({
	Pinecone: class {
		index() {
			return { upsertRecords: mockUpsertRecords };
		}
		describeIndex = mockDescribeIndex;
	},
}));

import { spawn } from "node:child_process";
import {
	getArticlesByStatus,
	updateArticleStatus,
} from "./article-repository.js";
import { getSummaryByArticleId } from "./summary-repository.js";

// We need to import after mocks
const { runRagIngestion, ensureCollection, chunkDocuments } = await import(
	"./rag-ingestor.js"
);

describe("RAG Ingestor", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.PINECONE_API_KEY = "test-pinecone-key";
	});

	describe("ensureCollection", () => {
		it("should verify Pinecone index is reachable", async () => {
			mockDescribeIndex.mockResolvedValueOnce({
				status: { state: "Ready" },
				dimension: 1024,
				metric: "cosine",
			});

			await ensureCollection();

			expect(mockDescribeIndex).toHaveBeenCalledWith("aijourney-kb");
		});

		it("should throw when Pinecone index is not reachable", async () => {
			mockDescribeIndex.mockRejectedValueOnce(new Error("Connection refused"));

			await expect(ensureCollection()).rejects.toThrow(
				"Pinecone index 'aijourney-kb' not reachable",
			);
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
				if (status === "summarized")
					return [
						{
							id: "a1",
							title: "Test Article",
							url: "http://test.com",
							source: "test",
							status: "summarized",
						} as any,
					];
				return [];
			});
			vi.mocked(getSummaryByArticleId).mockResolvedValue(null);

			const result = await runRagIngestion();

			expect(result.ingested).toBe(0);
			expect(result.errors).toContain("No summary found for article a1");
		});

		it("should process articles through chunk → upsert pipeline", async () => {
			const mockArticle = {
				id: "a1",
				title: "AI Best Practices",
				url: "http://test.com/ai",
				source: "blog",
				status: "summarized",
				crawledAt: "2025-01-01",
			};
			const mockSummary = {
				id: "s1",
				articleId: "a1",
				model: "gpt-5-mini",
				createdAt: "2025-01-01",
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

			// Mock chunker via spawn
			const mockChunks = [
				{
					doc_id: "a1",
					index: 0,
					text: "AI Best Practices\nUse AI wisely",
					start: 0,
					end: 30,
				},
				{
					doc_id: "a1",
					index: 1,
					text: "Test outputs\nDon't trust blindly",
					start: 20,
					end: 52,
				},
			];
			mockSpawnResult = {
				stdout: JSON.stringify(mockChunks),
				stderr: "",
				code: 0,
			};

			const result = await runRagIngestion();

			expect(result.ingested).toBe(1);
			expect(result.totalChunks).toBe(2);
			expect(result.totalTokensUsed).toBe(0); // Pinecone handles embedding internally
			expect(result.errors).toHaveLength(0);
			expect(updateArticleStatus).toHaveBeenCalledWith("a1", "ingested");

			// Verify Pinecone upsertRecords was called with correct record format
			expect(mockUpsertRecords).toHaveBeenCalledTimes(1);
			const upsertArg = mockUpsertRecords.mock.calls[0][0];
			const upsertedRecords = upsertArg.records;
			expect(upsertedRecords).toHaveLength(2);
			expect(upsertedRecords[0]._id).toBe("a1:0");
			expect(upsertedRecords[0].text).toBe("AI Best Practices\nUse AI wisely");
			expect(upsertedRecords[0].doc_id).toBe("a1");
			expect(upsertedRecords[0].article_url).toBe("http://test.com/ai");
			expect(upsertedRecords[1]._id).toBe("a1:1");
		});
	});
});
