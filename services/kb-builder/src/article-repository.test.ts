import { beforeEach, describe, expect, it, vi } from "vitest";

// Must use vi.hoisted() so the mock fn is available when vi.mock hoists
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock("@aws-sdk/client-dynamodb", () => ({
	DynamoDBClient: class {
		constructor() {}
	},
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
	DynamoDBDocumentClient: {
		from: () => ({ send: mockSend }),
	},
	PutCommand: class {
		input: any;
		constructor(input: any) {
			this.input = input;
		}
	},
	ScanCommand: class {
		input: any;
		constructor(input: any) {
			this.input = input;
		}
	},
	QueryCommand: class {
		input: any;
		constructor(input: any) {
			this.input = input;
		}
	},
	GetCommand: class {
		input: any;
		constructor(input: any) {
			this.input = input;
		}
	},
	UpdateCommand: class {
		input: any;
		constructor(input: any) {
			this.input = input;
		}
	},
	DeleteCommand: class {
		input: any;
		constructor(input: any) {
			this.input = input;
		}
	},
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
			mockSend.mockResolvedValue({});

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
			expect(mockSend).toHaveBeenCalledOnce();
		});
	});

	describe("getArticleByUrl", () => {
		it("should return article when found", async () => {
			const article = { id: "a1", url: "https://example.com/article" };
			mockSend.mockResolvedValue({ Items: [article] });

			const result = await getArticleByUrl("https://example.com/article");

			expect(result).toEqual(article);
		});

		it("should return null when not found", async () => {
			mockSend.mockResolvedValue({ Items: [] });

			const result = await getArticleByUrl("https://example.com/missing");

			expect(result).toBeNull();
		});

		it("should return null when Items is undefined", async () => {
			mockSend.mockResolvedValue({});

			const result = await getArticleByUrl("https://example.com/missing");

			expect(result).toBeNull();
		});
	});

	describe("getAllArticles", () => {
		it("should return all articles sorted by createdAt desc", async () => {
			const articles = [
				{ id: "1", createdAt: "2026-01-01T00:00:00Z" },
				{ id: "2", createdAt: "2026-01-03T00:00:00Z" },
				{ id: "3", createdAt: "2026-01-02T00:00:00Z" },
			];
			mockSend.mockResolvedValue({ Items: articles });

			const result = await getAllArticles();

			expect(result[0].id).toBe("2");
			expect(result[1].id).toBe("3");
			expect(result[2].id).toBe("1");
		});

		it("should handle pagination", async () => {
			mockSend
				.mockResolvedValueOnce({
					Items: [{ id: "1", createdAt: "2026-01-01T00:00:00Z" }],
					LastEvaluatedKey: { id: "1" },
				})
				.mockResolvedValueOnce({
					Items: [{ id: "2", createdAt: "2026-01-02T00:00:00Z" }],
				});

			const result = await getAllArticles();

			expect(result).toHaveLength(2);
			expect(mockSend).toHaveBeenCalledTimes(2);
		});
	});

	describe("getArticlesByStatus", () => {
		it("should query using status-crawledAt-index", async () => {
			mockSend.mockResolvedValue({ Items: [{ id: "1", status: "fetched" }] });

			const result = await getArticlesByStatus("fetched");

			expect(result).toHaveLength(1);
			const command = mockSend.mock.calls[0][0];
			expect(command.input.IndexName).toBe("status-crawledAt-index");
		});

		it("should return empty array when no items", async () => {
			mockSend.mockResolvedValue({});

			const result = await getArticlesByStatus("fetched");

			expect(result).toEqual([]);
		});
	});

	describe("getArticleById", () => {
		it("should return article when found", async () => {
			const article = { id: "a1", title: "Test" };
			mockSend.mockResolvedValue({ Item: article });

			const result = await getArticleById("a1");

			expect(result).toEqual(article);
		});

		it("should return null when not found", async () => {
			mockSend.mockResolvedValue({});

			const result = await getArticleById("non-existent");

			expect(result).toBeNull();
		});
	});

	describe("countArticles", () => {
		it("should return count from scan", async () => {
			mockSend.mockResolvedValue({ Count: 42 });

			const result = await countArticles();

			expect(result).toBe(42);
		});

		it("should return 0 when Count is undefined", async () => {
			mockSend.mockResolvedValue({});

			const result = await countArticles();

			expect(result).toBe(0);
		});
	});

	describe("updateArticleStatus", () => {
		it("should update status and updatedAt", async () => {
			mockSend.mockResolvedValue({});

			await updateArticleStatus("a1", "summarized");

			expect(mockSend).toHaveBeenCalledOnce();
			const command = mockSend.mock.calls[0][0];
			expect(command.input.Key).toEqual({ id: "a1" });
			expect(command.input.UpdateExpression).toContain("#s = :status");
		});

		it("should include qualityScore when provided", async () => {
			mockSend.mockResolvedValue({});

			await updateArticleStatus("a1", "quality_passed", { qualityScore: 0.85 });

			const command = mockSend.mock.calls[0][0];
			expect(command.input.UpdateExpression).toContain("#qs = :qs");
			expect(command.input.ExpressionAttributeValues[":qs"]).toBe(0.85);
		});
	});

	describe("deleteArticle", () => {
		it("should delete existing article and return true", async () => {
			mockSend
				.mockResolvedValueOnce({ Item: { id: "a1" } }) // getArticleById
				.mockResolvedValueOnce({}); // DeleteCommand

			const result = await deleteArticle("a1");

			expect(result).toBe(true);
			expect(mockSend).toHaveBeenCalledTimes(2);
		});

		it("should return false when article does not exist", async () => {
			mockSend.mockResolvedValueOnce({}); // getArticleById returns undefined

			const result = await deleteArticle("non-existent");

			expect(result).toBe(false);
			expect(mockSend).toHaveBeenCalledOnce();
		});
	});
});
