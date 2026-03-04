import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock log-stream
vi.mock("./log-stream.js", () => ({
	log: vi.fn(),
}));

// Mock OpenAI SDK
const mockEmbeddingsCreate = vi.fn().mockResolvedValue({
	data: [{ index: 0, embedding: new Array(1536).fill(0.1) }],
});

vi.mock("openai", () => ({
	default: class {
		embeddings = { create: mockEmbeddingsCreate };
	},
}));

// Mock Pinecone SDK
const mockQuery = vi.fn();
const mockDescribeIndex = vi.fn();

vi.mock("@pinecone-database/pinecone", () => ({
	Pinecone: class {
		index() {
			return { query: mockQuery };
		}
		describeIndex = mockDescribeIndex;
	},
}));

const { searchKnowledgeBase, isRagAvailable } = await import("./rag-query.js");

describe("RAG Query", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.PINECONE_API_KEY = "test-pinecone-key";
		process.env.OPENAI_API_KEY = "test-openai-key";
	});

	describe("searchKnowledgeBase", () => {
		it("should embed query via OpenAI and search Pinecone", async () => {
			mockQuery.mockResolvedValueOnce({
				matches: [
					{
						id: "a1:0",
						score: 0.85,
						metadata: {
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
						id: "a2:1",
						score: 0.72,
						metadata: {
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
			});

			const result = await searchKnowledgeBase("How to use AI at work?");

			expect(result.chunks).toHaveLength(2);
			expect(result.chunks[0]!.score).toBe(0.85);
			expect(result.chunks[0]!.text).toBe("AI is transforming the workplace");
			expect(result.chunks[0]!.metadata.tags).toEqual(["ai", "workplace"]);

			// Verify OpenAI embedding was called
			expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
				model: "text-embedding-3-small",
				input: "How to use AI at work?",
				dimensions: 1536,
			});

			// Verify Pinecone query was called with vector
			expect(mockQuery).toHaveBeenCalledWith({
				vector: expect.any(Array),
				topK: 8,
				includeMetadata: true,
			});
		});

		it("should return empty chunks when Pinecone returns no results", async () => {
			mockQuery.mockResolvedValueOnce({
				matches: [],
			});

			const result = await searchKnowledgeBase("obscure topic");

			expect(result.chunks).toHaveLength(0);
		});

		it("should filter results below scoreThreshold", async () => {
			mockQuery.mockResolvedValueOnce({
				matches: [
					{
						id: "a1:0",
						score: 0.8,
						metadata: {
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
						id: "a2:0",
						score: 0.2,
						metadata: {
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
			});

			const result = await searchKnowledgeBase("test", 3, 0.5);

			expect(result.chunks).toHaveLength(1);
			expect(result.chunks[0]!.text).toBe("Good match");
		});

		it("should respect topK parameter", async () => {
			mockQuery.mockResolvedValueOnce({
				matches: [],
			});

			await searchKnowledgeBase("test", 3, 0.5);

			expect(mockQuery).toHaveBeenCalledWith(
				expect.objectContaining({ topK: 3 }),
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
