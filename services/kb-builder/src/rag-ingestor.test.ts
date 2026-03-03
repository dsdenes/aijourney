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
		it("should chunk text into paragraph-aware overlapping pieces", () => {
			const result = chunkDocuments([
				{ id: "a1", text: "Hello world", chunk_size: 800, overlap: 150 },
			]);

			expect(result).toHaveLength(1);
			expect(result[0].doc_id).toBe("a1");
			expect(result[0].text).toBe("Hello world");
			expect(result[0].index).toBe(0);
		});

		it("should split long text into multiple chunks", () => {
			const longText = Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1} with some content.`).join("\n\n");
			const result = chunkDocuments([
				{ id: "a1", text: longText, chunk_size: 200, overlap: 50 },
			]);

			expect(result.length).toBeGreaterThan(1);
			for (const chunk of result) {
				expect(chunk.doc_id).toBe("a1");
			}
		});

		it("should handle empty text", () => {
			const result = chunkDocuments([
				{ id: "a1", text: "", chunk_size: 800, overlap: 150 },
			]);
			expect(result).toHaveLength(0);
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

			const result = await runRagIngestion();

			expect(result.ingested).toBe(1);
			expect(result.totalChunks).toBeGreaterThan(0);
			expect(result.totalTokensUsed).toBe(0); // Pinecone handles embedding internally
			expect(result.errors).toHaveLength(0);
			expect(updateArticleStatus).toHaveBeenCalledWith("a1", "ingested");

			// Verify Pinecone upsertRecords was called with correct record format
			expect(mockUpsertRecords).toHaveBeenCalledTimes(1);
			const upsertArg = mockUpsertRecords.mock.calls[0][0];
			const upsertedRecords = upsertArg.records;
			expect(upsertedRecords.length).toBeGreaterThan(0);
			expect(upsertedRecords[0]._id).toBe("a1:0");
			expect(upsertedRecords[0].doc_id).toBe("a1");
			expect(upsertedRecords[0].article_url).toBe("http://test.com/ai");
		});
	});
});
