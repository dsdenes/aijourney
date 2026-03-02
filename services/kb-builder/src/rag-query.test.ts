import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock log-stream
vi.mock("./log-stream.js", () => ({
	log: vi.fn(),
}));

// Mock OpenAI
const mockEmbeddingsCreate = vi.fn();
vi.mock("openai", () => ({
	default: class {
		embeddings = { create: mockEmbeddingsCreate };
	},
}));

// Mock global fetch for Qdrant
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { searchKnowledgeBase, isRagAvailable } = await import("./rag-query.js");

describe("RAG Query", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.OPENAI_API_KEY = "sk-test-key";
	});

	describe("searchKnowledgeBase", () => {
		it("should embed query and search Qdrant", async () => {
			const queryVector = Array(1536).fill(0.5);
			mockEmbeddingsCreate.mockResolvedValue({
				data: [{ index: 0, embedding: queryVector }],
				usage: { total_tokens: 10 },
			});

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					result: [
						{
							id: "uuid-1",
							score: 0.85,
							payload: {
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
							id: "uuid-2",
							score: 0.72,
							payload: {
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
				}),
			});

			const result = await searchKnowledgeBase("How to use AI at work?");

			expect(result.chunks).toHaveLength(2);
			expect(result.chunks[0].score).toBe(0.85);
			expect(result.chunks[0].text).toBe("AI is transforming the workplace");
			expect(result.chunks[0].metadata.tags).toEqual(["ai", "workplace"]);
			expect(result.tokensUsed).toBe(10);

			// Verify Qdrant was called with the embedding
			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining("/collections/kb_chunks/points/search"),
				expect.objectContaining({ method: "POST" }),
			);
			const qdrantBody = JSON.parse(fetchMock.mock.calls[0][1].body);
			expect(qdrantBody.vector).toEqual(queryVector);
			expect(qdrantBody.limit).toBe(8);
		});

		it("should return empty chunks when Qdrant returns no results", async () => {
			mockEmbeddingsCreate.mockResolvedValue({
				data: [{ index: 0, embedding: Array(1536).fill(0) }],
				usage: { total_tokens: 5 },
			});

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ result: [] }),
			});

			const result = await searchKnowledgeBase("obscure topic");

			expect(result.chunks).toHaveLength(0);
			expect(result.tokensUsed).toBe(5);
		});

		it("should respect topK and scoreThreshold parameters", async () => {
			mockEmbeddingsCreate.mockResolvedValue({
				data: [{ index: 0, embedding: Array(1536).fill(0) }],
				usage: { total_tokens: 5 },
			});

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ result: [] }),
			});

			await searchKnowledgeBase("test", 3, 0.5);

			const qdrantBody = JSON.parse(fetchMock.mock.calls[0][1].body);
			expect(qdrantBody.limit).toBe(3);
			expect(qdrantBody.score_threshold).toBe(0.5);
		});
	});

	describe("isRagAvailable", () => {
		it("should return true when collection has points", async () => {
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ result: { points_count: 150 } }),
			});

			const available = await isRagAvailable();
			expect(available).toBe(true);
		});

		it("should return false when collection is empty", async () => {
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ result: { points_count: 0 } }),
			});

			const available = await isRagAvailable();
			expect(available).toBe(false);
		});

		it("should return false when Qdrant is unreachable", async () => {
			fetchMock.mockRejectedValueOnce(new Error("Connection refused"));

			const available = await isRagAvailable();
			expect(available).toBe(false);
		});
	});
});
