import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock db.ts to return a mock collection
const mockInsertOne = vi.fn().mockResolvedValue({});
const mockFindOne = vi.fn().mockResolvedValue(null);
const mockUpdateOne = vi.fn().mockResolvedValue({});
const mockDeleteOne = vi.fn().mockResolvedValue({ deletedCount: 1 });
const mockCountDocuments = vi.fn().mockResolvedValue(0);
const mockToArray = vi.fn().mockResolvedValue([]);
const mockSort = vi.fn().mockReturnValue({ toArray: mockToArray });
const mockFind = vi
	.fn()
	.mockReturnValue({ sort: mockSort, toArray: mockToArray });
const mockCollection = {
	insertOne: mockInsertOne,
	findOne: mockFindOne,
	updateOne: mockUpdateOne,
	deleteOne: mockDeleteOne,
	countDocuments: mockCountDocuments,
	find: mockFind,
};

vi.mock("./db.js", () => ({
	getDb: () => ({
		collection: () => mockCollection,
	}),
}));

vi.mock("@aijourney/shared", async () => {
	const actual = await vi.importActual("@aijourney/shared");
	return {
		...actual,
		generateId: vi.fn().mockReturnValue("test-id-abc"),
		nowISO: vi.fn().mockReturnValue("2026-01-15T10:00:00.000Z"),
	};
});

import {
	countArticles,
	deleteArticle,
	getAllArticles,
	getArticleById,
	getArticleByUrl,
	getArticlesByStatus,
	hashContent,
	saveArticle,
	updateArticleStatus,
} from "./article-repository.js";

describe("article-repository", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Restore default mock returns
		mockFind.mockReturnValue({ sort: mockSort, toArray: mockToArray });
		mockSort.mockReturnValue({ toArray: mockToArray });
		mockToArray.mockResolvedValue([]);
	});

	describe("hashContent", () => {
		it("should return SHA-256 hex hash of content", () => {
			const hash = hashContent("test content");
			expect(hash).toMatch(/^[0-9a-f]{64}$/);
		});

		it("should return same hash for same content", () => {
			const h1 = hashContent("identical");
			const h2 = hashContent("identical");
			expect(h1).toBe(h2);
		});

		it("should return different hash for different content", () => {
			const h1 = hashContent("content A");
			const h2 = hashContent("content B");
			expect(h1).not.toBe(h2);
		});
	});

	describe("saveArticle", () => {
		it("should create article with generated id and timestamps", async () => {
			mockInsertOne.mockResolvedValue({});

			const result = await saveArticle({
				url: "https://example.com/article",
				title: "Test Article",
				source: "example.com",
				fetchedAt: "2026-01-15T09:00:00Z",
				contentHash: "hash123",
				s3Key: "",
				status: "fetched",
				qualityScore: undefined,
				metadata: { wordCount: 500, language: "en", tags: [] },
				dedupe: { isDuplicate: false },
				ingestionRunId: undefined,
			});

			expect(result.id).toBe("test-id-abc");
			expect(result.createdAt).toBe("2026-01-15T10:00:00.000Z");
			expect(result.updatedAt).toBe("2026-01-15T10:00:00.000Z");
			expect(result.url).toBe("https://example.com/article");
			expect(mockInsertOne).toHaveBeenCalledOnce();
			// Verify doc uses _id instead of id
			const doc = mockInsertOne.mock.calls[0]![0];
			expect(doc._id).toBe("test-id-abc");
			expect(doc.id).toBeUndefined();
		});
	});

	describe("getArticleByUrl", () => {
		it("should return article when found", async () => {
			mockFindOne.mockResolvedValue({
				_id: "a1",
				url: "https://example.com/article",
			});

			const result = await getArticleByUrl("https://example.com/article");

			expect(result).toEqual({
				id: "a1",
				url: "https://example.com/article",
			});
			expect(mockFindOne).toHaveBeenCalledWith({
				url: "https://example.com/article",
			});
		});

		it("should return null when not found", async () => {
			mockFindOne.mockResolvedValue(null);

			const result = await getArticleByUrl("https://example.com/missing");

			expect(result).toBeNull();
		});
	});

	describe("getAllArticles", () => {
		it("should return all articles sorted by createdAt desc", async () => {
			const docs = [
				{ _id: "2", createdAt: "2026-01-03T00:00:00Z" },
				{ _id: "3", createdAt: "2026-01-02T00:00:00Z" },
				{ _id: "1", createdAt: "2026-01-01T00:00:00Z" },
			];
			mockToArray.mockResolvedValue(docs);
			mockSort.mockReturnValue({ toArray: mockToArray });
			mockFind.mockReturnValue({ sort: mockSort });

			const result = await getAllArticles();

			expect(result).toHaveLength(3);
			expect(result[0]!.id).toBe("2");
			expect(mockFind).toHaveBeenCalledWith({});
			expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
		});
	});

	describe("getArticlesByStatus", () => {
		it("should query by status and sort by fetchedAt desc", async () => {
			mockToArray.mockResolvedValue([{ _id: "1", status: "fetched" }]);
			mockSort.mockReturnValue({ toArray: mockToArray });
			mockFind.mockReturnValue({ sort: mockSort });

			const result = await getArticlesByStatus("fetched");

			expect(result).toHaveLength(1);
			expect(mockFind).toHaveBeenCalledWith({ status: "fetched" });
			expect(mockSort).toHaveBeenCalledWith({ fetchedAt: -1 });
		});

		it("should return empty array when no items", async () => {
			mockToArray.mockResolvedValue([]);
			mockSort.mockReturnValue({ toArray: mockToArray });
			mockFind.mockReturnValue({ sort: mockSort });

			const result = await getArticlesByStatus("fetched");
			expect(result).toEqual([]);
		});
	});

	describe("getArticleById", () => {
		it("should return article when found", async () => {
			mockFindOne.mockResolvedValue({ _id: "a1", title: "Test" });

			const result = await getArticleById("a1");

			expect(result).toEqual({ id: "a1", title: "Test" });
			expect(mockFindOne).toHaveBeenCalledWith({ _id: "a1" });
		});

		it("should return null when not found", async () => {
			mockFindOne.mockResolvedValue(null);

			const result = await getArticleById("no-exist");
			expect(result).toBeNull();
		});
	});

	describe("countArticles", () => {
		it("should return document count", async () => {
			mockCountDocuments.mockResolvedValue(15);

			const result = await countArticles();
			expect(result).toBe(15);
		});
	});

	describe("updateArticleStatus", () => {
		it("should update status and updatedAt", async () => {
			await updateArticleStatus("a1", "summarized");

			expect(mockUpdateOne).toHaveBeenCalledWith(
				{ _id: "a1" },
				{
					$set: {
						status: "summarized",
						updatedAt: "2026-01-15T10:00:00.000Z",
					},
				},
			);
		});

		it("should include qualityScore when provided", async () => {
			await updateArticleStatus("a1", "quality_pass", {
				qualityScore: 0.85,
			});

			const setArg = mockUpdateOne.mock.calls[0]![1].$set;
			expect(setArg.qualityScore).toBe(0.85);
		});
	});

	describe("deleteArticle", () => {
		it("should return true when deleted", async () => {
			mockDeleteOne.mockResolvedValue({ deletedCount: 1 });

			const result = await deleteArticle("a1");
			expect(result).toBe(true);
			expect(mockDeleteOne).toHaveBeenCalledWith({ _id: "a1" });
		});

		it("should return false when not found", async () => {
			mockDeleteOne.mockResolvedValue({ deletedCount: 0 });

			const result = await deleteArticle("no-exist");
			expect(result).toBe(false);
		});
	});
});
