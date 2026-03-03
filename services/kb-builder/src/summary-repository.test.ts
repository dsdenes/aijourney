import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsertOne = vi.fn().mockResolvedValue({});
const mockFindOne = vi.fn().mockResolvedValue(null);
const mockDeleteOne = vi.fn().mockResolvedValue({ deletedCount: 0 });
const mockCountDocuments = vi.fn().mockResolvedValue(0);
const mockToArray = vi.fn().mockResolvedValue([]);
const mockSort = vi.fn().mockReturnValue({ toArray: mockToArray });
const mockFind = vi.fn().mockReturnValue({ sort: mockSort });
const mockCollection = {
	insertOne: mockInsertOne,
	findOne: mockFindOne,
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
		generateId: vi.fn().mockReturnValue("test-summary-id"),
		nowISO: vi.fn().mockReturnValue("2026-01-15T10:00:00.000Z"),
	};
});

import {
	countSummaries,
	deleteSummaryByArticleId,
	deleteSummaryById,
	getAllSummaries,
	getSummaryByArticleId,
	getSummaryById,
	saveSummary,
} from "./summary-repository.js";

describe("summary-repository", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFind.mockReturnValue({ sort: mockSort });
		mockSort.mockReturnValue({ toArray: mockToArray });
		mockToArray.mockResolvedValue([]);
	});

	describe("saveSummary", () => {
		it("should create summary with generated id and timestamp", async () => {
			mockInsertOne.mockResolvedValue({});

			const result = await saveSummary({
				articleId: "a1",
				runRequestId: "batch-1",
				version: 1,
				content: {
					title: "Test Summary",
					keyPoints: ["Point 1"],
					dos: ["Do this"],
					donts: ["Don't do that"],
					tags: ["tools"],
					difficulty: "beginner",
					roleRelevance: [{ role: "engineering", relevanceScore: 0.9 }],
					citations: [{ text: "Quote", sourceSection: "intro" }],
				} as any,
				model: "gpt-5-mini",
				promptVersion: "v2-batch",
				tokensUsed: 500,
				promptTokens: 300,
				completionTokens: 200,
			});

			expect(result.id).toBe("test-summary-id");
			expect(result.createdAt).toBe("2026-01-15T10:00:00.000Z");
			expect(result.articleId).toBe("a1");
			expect(mockInsertOne).toHaveBeenCalledOnce();
			// Verify _id mapping
			const doc = mockInsertOne.mock.calls[0]![0];
			expect(doc._id).toBe("test-summary-id");
		});
	});

	describe("getSummaryByArticleId", () => {
		it("should return summary when found", async () => {
			mockFindOne.mockResolvedValue({ _id: "s1", articleId: "a1" });

			const result = await getSummaryByArticleId("a1");

			expect(result).toEqual({ id: "s1", articleId: "a1" });
			expect(mockFindOne).toHaveBeenCalledWith({ articleId: "a1" });
		});

		it("should return null when not found", async () => {
			mockFindOne.mockResolvedValue(null);

			const result = await getSummaryByArticleId("a99");

			expect(result).toBeNull();
		});
	});

	describe("getSummaryById", () => {
		it("should return summary when found", async () => {
			mockFindOne.mockResolvedValue({ _id: "s1", articleId: "a1" });

			const result = await getSummaryById("s1");

			expect(result).toEqual({ id: "s1", articleId: "a1" });
			expect(mockFindOne).toHaveBeenCalledWith({ _id: "s1" });
		});

		it("should return null when not found", async () => {
			mockFindOne.mockResolvedValue(null);

			const result = await getSummaryById("non-existent");
			expect(result).toBeNull();
		});
	});

	describe("getAllSummaries", () => {
		it("should return all summaries sorted by createdAt desc", async () => {
			const docs = [
				{ _id: "2", createdAt: "2026-01-03T00:00:00Z" },
				{ _id: "3", createdAt: "2026-01-02T00:00:00Z" },
				{ _id: "1", createdAt: "2026-01-01T00:00:00Z" },
			];
			mockToArray.mockResolvedValue(docs);
			mockSort.mockReturnValue({ toArray: mockToArray });
			mockFind.mockReturnValue({ sort: mockSort });

			const result = await getAllSummaries();

			expect(result).toHaveLength(3);
			expect(result[0]!.id).toBe("2");
			expect(mockFind).toHaveBeenCalledWith({});
			expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
		});
	});

	describe("countSummaries", () => {
		it("should return count", async () => {
			mockCountDocuments.mockResolvedValue(15);

			const result = await countSummaries();
			expect(result).toBe(15);
		});
	});

	describe("deleteSummaryById", () => {
		it("should call deleteOne with _id", async () => {
			await deleteSummaryById("s1");

			expect(mockDeleteOne).toHaveBeenCalledWith({ _id: "s1" });
		});
	});

	describe("deleteSummaryByArticleId", () => {
		it("should delete and return true when found", async () => {
			mockDeleteOne.mockResolvedValue({ deletedCount: 1 });

			const result = await deleteSummaryByArticleId("a1");

			expect(result).toBe(true);
			expect(mockDeleteOne).toHaveBeenCalledWith({ articleId: "a1" });
		});

		it("should return false when no summary exists", async () => {
			mockDeleteOne.mockResolvedValue({ deletedCount: 0 });

			const result = await deleteSummaryByArticleId("a99");

			expect(result).toBe(false);
		});
	});
});
