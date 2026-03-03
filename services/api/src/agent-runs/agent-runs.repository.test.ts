import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentRunsRepository } from "./agent-runs.repository";

// We test the repository with a mock MongoDB Db to verify
// that the correct collection operations are called.

const mockInsertOne = vi.fn().mockResolvedValue({});
const mockFindOne = vi.fn().mockResolvedValue(null);
const mockUpdateOne = vi.fn().mockResolvedValue({});
const mockToArray = vi.fn().mockResolvedValue([]);
const mockLimit = vi.fn().mockReturnValue({ toArray: mockToArray });
const mockSort = vi
	.fn()
	.mockReturnValue({
		limit: vi.fn().mockReturnValue({ toArray: mockToArray }),
		toArray: mockToArray,
	});
const mockFind = vi
	.fn()
	.mockReturnValue({ limit: mockLimit, sort: mockSort, toArray: mockToArray });
const mockCollection = {
	insertOne: mockInsertOne,
	findOne: mockFindOne,
	updateOne: mockUpdateOne,
	find: mockFind,
};
const mockDb = {
	collection: vi.fn().mockReturnValue(mockCollection),
};

describe("AgentRunsRepository", () => {
	let repo: AgentRunsRepository;

	beforeEach(() => {
		vi.clearAllMocks();
		mockFind.mockReturnValue({
			limit: mockLimit,
			sort: mockSort,
			toArray: mockToArray,
		});
		mockSort.mockReturnValue({
			limit: vi.fn().mockReturnValue({ toArray: mockToArray }),
			toArray: mockToArray,
		});
		mockLimit.mockReturnValue({ toArray: mockToArray });
		mockToArray.mockResolvedValue([]);
		// Directly instantiate the repo with our mock MongoDB Db
		repo = new AgentRunsRepository(mockDb as any);
	});

	describe("create", () => {
		it("should insert document with _id mapping and return the run", async () => {
			const run = {
				id: "run-1",
				agent: "chat" as const,
				status: "running" as const,
				input: "test",
				createdAt: "2026-01-01T00:00:00Z",
			};
			mockInsertOne.mockResolvedValue({});

			const result = await repo.create(run as any);

			expect(result).toEqual(run);
			expect(mockInsertOne).toHaveBeenCalledOnce();
			const doc = mockInsertOne.mock.calls[0]![0];
			expect(doc._id).toBe("run-1");
			expect(doc.agent).toBe("chat");
		});
	});

	describe("getById", () => {
		it("should return the item when found", async () => {
			mockFindOne.mockResolvedValue({ _id: "run-1", agent: "chat" });

			const result = await repo.getById("run-1");

			expect(result).toEqual({ id: "run-1", agent: "chat" });
			expect(mockFindOne).toHaveBeenCalledWith({ _id: "run-1" });
		});

		it("should return undefined when item not found", async () => {
			mockFindOne.mockResolvedValue(null);

			const result = await repo.getById("non-existent");

			expect(result).toBeUndefined();
		});
	});

	describe("update", () => {
		it("should call updateOne with $set", async () => {
			mockUpdateOne.mockResolvedValue({});

			await repo.update("run-1", {
				status: "completed" as any,
				output: "done",
				tokensUsed: 100,
			});

			expect(mockUpdateOne).toHaveBeenCalledWith(
				{ _id: "run-1" },
				{
					$set: {
						status: "completed",
						output: "done",
						tokensUsed: 100,
					},
				},
			);
		});

		it("should skip update when no fields provided", async () => {
			await repo.update("run-1", {});

			expect(mockUpdateOne).not.toHaveBeenCalled();
		});

		it("should exclude id from update", async () => {
			mockUpdateOne.mockResolvedValue({});

			await repo.update("run-1", {
				id: "ignored" as any,
				output: "test",
			} as any);

			const setArg = mockUpdateOne.mock.calls[0]![1].$set;
			expect(setArg.id).toBeUndefined();
			expect(setArg.output).toBe("test");
		});
	});

	describe("listAll", () => {
		it("should find with default limit of 200", async () => {
			const docs = [{ _id: "1" }, { _id: "2" }];
			mockToArray.mockResolvedValue(docs);

			const result = await repo.listAll();

			expect(result).toHaveLength(2);
			expect(mockLimit).toHaveBeenCalledWith(200);
		});

		it("should use provided limit", async () => {
			mockToArray.mockResolvedValue([]);

			await repo.listAll(50);

			expect(mockLimit).toHaveBeenCalledWith(50);
		});

		it("should return empty array when no items", async () => {
			mockToArray.mockResolvedValue([]);

			const result = await repo.listAll();

			expect(result).toEqual([]);
		});
	});

	describe("listByAgent", () => {
		it("should find by agent sorted by createdAt desc", async () => {
			const mockLimitInner = vi
				.fn()
				.mockReturnValue({
					toArray: vi.fn().mockResolvedValue([{ _id: "1", agent: "chat" }]),
				});
			mockSort.mockReturnValue({
				limit: mockLimitInner,
				toArray: vi.fn().mockResolvedValue([]),
			});
			mockFind.mockReturnValue({ sort: mockSort });

			const result = await repo.listByAgent("chat");

			expect(result).toHaveLength(1);
			expect(mockFind).toHaveBeenCalledWith({ agent: "chat" });
			expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
		});
	});

	describe("listByStatus", () => {
		it("should find by status sorted by createdAt desc", async () => {
			const mockLimitInner = vi
				.fn()
				.mockReturnValue({
					toArray: vi.fn().mockResolvedValue([{ _id: "1", status: "running" }]),
				});
			mockSort.mockReturnValue({
				limit: mockLimitInner,
				toArray: vi.fn().mockResolvedValue([]),
			});
			mockFind.mockReturnValue({ sort: mockSort });

			const result = await repo.listByStatus("running");

			expect(result).toHaveLength(1);
			expect(mockFind).toHaveBeenCalledWith({ status: "running" });
			expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
		});
	});
});
