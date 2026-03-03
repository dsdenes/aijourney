import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock log-stream
vi.mock("./log-stream.js", () => ({
	log: vi.fn(),
}));

// Mock Pinecone SDK
const mockSearchRecords = vi.fn();
const mockDescribeIndex = vi.fn();

vi.mock("@pinecone-database/pinecone", () => ({
	Pinecone: class {
		index() {
			return { searchRecords: mockSearchRecords };
		}
		describeIndex = mockDescribeIndex;
	},
}));

const { searchKnowledgeBase, isRagAvailable } = await import("./rag-query.js");

describe("RAG Query", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.PINECONE_API_KEY = "test-pinecone-key";
	});

	describe("searchKnowledgeBase", () => {
		it("should search Pinecone with integrated embedding", async () => {
			mockSearchRecords.mockResolvedValueOnce({
				result: {
					hits: [
						{
							_id: "a1:0",
							_score: 0.85,
							fields: {
								text: "AI is transforming the workplace",
								doc_id: "a1",
								chunk_index: 0,
								article_url: "http://test.com/ai",
								article_title: "AI Article",
								article_source: "blog",
								summary_title: "AI Best Practices",
								tags: ["ai", "workplace"],
								difficulty: "beginner",
							},
						},
						{
							_id: "a2:1",
							_score: 0.72,
							fields: {
								text: "Machine learning requires good data",
								doc_id: "a2",
								chunk_index: 1,
								article_url: "http://test.com/ml",
								article_title: "ML Guide",
								article_source: "docs",
								summary_title: "ML for Beginners",
								tags: ["ml", "data"],
								difficulty: "intermediate",
							},
						},
					],
				},
			});

			const result = await searchKnowledgeBase("How to use AI at work?");

			expect(result.chunks).toHaveLength(2);
			expect(result.chunks[0]!.score).toBe(0.85);
			expect(result.chunks[0]!.text).toBe("AI is transforming the workplace");
			expect(result.chunks[0]!.metadata.tags).toEqual(["ai", "workplace"]);
			expect(result.tokensUsed).toBe(0); // Pinecone handles embedding internally

			// Verify Pinecone searchRecords was called with text input
			expect(mockSearchRecords).toHaveBeenCalledWith({
				query: {
					topK: 8,
					inputs: { text: "How to use AI at work?" },
				},
				fields: [
					"text",
					"doc_id",
					"chunk_index",
					"article_url",
					"article_title",
					"article_source",
					"summary_title",
					"tags",
					"difficulty",
				],
			});
		});

		it("should return empty chunks when Pinecone returns no results", async () => {
			mockSearchRecords.mockResolvedValueOnce({
				result: { hits: [] },
			});

			const result = await searchKnowledgeBase("obscure topic");

			expect(result.chunks).toHaveLength(0);
			expect(result.tokensUsed).toBe(0);
		});

		it("should filter results below scoreThreshold", async () => {
			mockSearchRecords.mockResolvedValueOnce({
				result: {
					hits: [
						{
							_id: "a1:0",
							_score: 0.8,
							fields: {
								text: "Good match",
								doc_id: "a1",
								chunk_index: 0,
								article_url: "",
								article_title: "",
								article_source: "",
								summary_title: "",
								tags: [],
								difficulty: "",
							},
						},
						{
							_id: "a2:0",
							_score: 0.2,
							fields: {
								text: "Poor match",
								doc_id: "a2",
								chunk_index: 0,
								article_url: "",
								article_title: "",
								article_source: "",
								summary_title: "",
								tags: [],
								difficulty: "",
							},
						},
					],
				},
			});

			const result = await searchKnowledgeBase("test", 3, 0.5);

			expect(result.chunks).toHaveLength(1);
			expect(result.chunks[0]!.text).toBe("Good match");
		});

		it("should respect topK parameter", async () => {
			mockSearchRecords.mockResolvedValueOnce({
				result: { hits: [] },
			});

			await searchKnowledgeBase("test", 3, 0.5);

			expect(mockSearchRecords).toHaveBeenCalledWith(
				expect.objectContaining({
					query: expect.objectContaining({ topK: 3 }),
				}),
			);
		});
	});

	describe("isRagAvailable", () => {
		it("should return true when Pinecone index is Ready", async () => {
			mockDescribeIndex.mockResolvedValueOnce({
				status: { state: "Ready" },
			});

			const available = await isRagAvailable();
			expect(available).toBe(true);
		});

		it("should return false when Pinecone index is not Ready", async () => {
			mockDescribeIndex.mockResolvedValueOnce({
				status: { state: "Initializing" },
			});

			const available = await isRagAvailable();
			expect(available).toBe(false);
		});

		it("should return false when Pinecone is unreachable", async () => {
			mockDescribeIndex.mockRejectedValueOnce(new Error("Connection refused"));

			const available = await isRagAvailable();
			expect(available).toBe(false);
		});
	});
});
