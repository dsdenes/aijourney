import { beforeEach, describe, expect, it, vi } from "vitest";

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
	});

	describe("saveSummary", () => {
		it("should create summary with generated id and timestamp", async () => {
			mockSend.mockResolvedValue({});

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
			expect(mockSend).toHaveBeenCalledOnce();
		});
	});

	describe("getSummaryByArticleId", () => {
		it("should return summary when found", async () => {
			const summary = { id: "s1", articleId: "a1" };
			mockSend.mockResolvedValue({ Items: [summary] });

			const result = await getSummaryByArticleId("a1");

			expect(result).toEqual(summary);
			const command = mockSend.mock.calls[0][0];
			expect(command.input.IndexName).toBe("articleId-index");
		});

		it("should return null when not found", async () => {
			mockSend.mockResolvedValue({ Items: [] });

			const result = await getSummaryByArticleId("a99");

			expect(result).toBeNull();
		});

		it("should return null when Items is undefined", async () => {
			mockSend.mockResolvedValue({});

			const result = await getSummaryByArticleId("a99");

			expect(result).toBeNull();
		});
	});

	describe("getSummaryById", () => {
		it("should return summary when found", async () => {
			const summary = { id: "s1", articleId: "a1" };
			mockSend.mockResolvedValue({ Item: summary });

			const result = await getSummaryById("s1");

			expect(result).toEqual(summary);
		});

		it("should return null when not found", async () => {
			mockSend.mockResolvedValue({});

			const result = await getSummaryById("non-existent");

			expect(result).toBeNull();
		});
	});

	describe("getAllSummaries", () => {
		it("should return all summaries sorted by createdAt desc", async () => {
			const summaries = [
				{ id: "1", createdAt: "2026-01-01T00:00:00Z" },
				{ id: "2", createdAt: "2026-01-03T00:00:00Z" },
				{ id: "3", createdAt: "2026-01-02T00:00:00Z" },
			];
			mockSend.mockResolvedValue({ Items: summaries });

			const result = await getAllSummaries();

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

			const result = await getAllSummaries();

			expect(result).toHaveLength(2);
			expect(mockSend).toHaveBeenCalledTimes(2);
		});
	});

	describe("countSummaries", () => {
		it("should return count", async () => {
			mockSend.mockResolvedValue({ Count: 15 });

			const result = await countSummaries();

			expect(result).toBe(15);
		});

		it("should return 0 when Count is undefined", async () => {
			mockSend.mockResolvedValue({});

			const result = await countSummaries();

			expect(result).toBe(0);
		});
	});

	describe("deleteSummaryById", () => {
		it("should send DeleteCommand", async () => {
			mockSend.mockResolvedValue({});

			await deleteSummaryById("s1");

			expect(mockSend).toHaveBeenCalledOnce();
			const command = mockSend.mock.calls[0][0];
			expect(command.input.Key).toEqual({ id: "s1" });
		});
	});

	describe("deleteSummaryByArticleId", () => {
		it("should delete summary and return true when found", async () => {
			mockSend
				.mockResolvedValueOnce({ Items: [{ id: "s1", articleId: "a1" }] }) // getSummaryByArticleId
				.mockResolvedValueOnce({}); // deleteSummaryById

			const result = await deleteSummaryByArticleId("a1");

			expect(result).toBe(true);
			expect(mockSend).toHaveBeenCalledTimes(2);
		});

		it("should return false when no summary exists", async () => {
			mockSend.mockResolvedValueOnce({ Items: [] });

			const result = await deleteSummaryByArticleId("a99");

			expect(result).toBe(false);
			expect(mockSend).toHaveBeenCalledOnce();
		});
	});
});
