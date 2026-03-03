import { Test, type TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MONGODB_DB } from "../mongodb/mongodb.module";
import { RunsRepository } from "./runs.repository";

describe("RunsRepository", () => {
	let repo: RunsRepository;
	let mockCollection: Record<string, ReturnType<typeof vi.fn>>;
	let mockDb: { collection: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		mockCollection = {
			insertOne: vi.fn().mockResolvedValue({}),
			findOne: vi.fn().mockResolvedValue(null),
			updateOne: vi.fn().mockResolvedValue({}),
			find: vi.fn().mockReturnValue({
				sort: vi.fn().mockReturnValue({
					toArray: vi.fn().mockResolvedValue([]),
				}),
				limit: vi.fn().mockReturnValue({
					toArray: vi.fn().mockResolvedValue([]),
				}),
				toArray: vi.fn().mockResolvedValue([]),
			}),
		};
		mockDb = {
			collection: vi.fn().mockReturnValue(mockCollection),
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				RunsRepository,
				{ provide: MONGODB_DB, useValue: mockDb },
			],
		}).compile();

		repo = module.get<RunsRepository>(RunsRepository);
	});

	describe("create", () => {
		it("should insert a run request document", async () => {
			const run = {
				id: "r1",
				userId: "u1",
				purpose: "kb_chat",
				status: "PENDING",
			};

			const result = await repo.create(run as any);
			expect(result).toEqual(run);

			const doc = mockCollection.insertOne.mock.calls[0]![0];
			expect(doc._id).toBe("r1");
		});
	});

	describe("getById", () => {
		it("should return run when found", async () => {
			mockCollection.findOne.mockResolvedValue({
				_id: "r1",
				status: "PENDING",
			});

			const result = await repo.getById("r1");
			expect(result).toEqual({ id: "r1", status: "PENDING" });
		});

		it("should return undefined when not found", async () => {
			mockCollection.findOne.mockResolvedValue(null);

			const result = await repo.getById("nonexistent");
			expect(result).toBeUndefined();
		});
	});

	describe("listByUser", () => {
		it("should find by userId", async () => {
			mockCollection.find.mockReturnValue({
				toArray: vi.fn().mockResolvedValue([
					{ _id: "r1", userId: "u1" },
					{ _id: "r2", userId: "u1" },
				]),
			});

			const result = await repo.listByUser("u1");
			expect(result).toHaveLength(2);
			expect(mockCollection.find).toHaveBeenCalledWith({ userId: "u1" });
		});
	});

	describe("listByStatus", () => {
		it("should find by status sorted by createdAt desc", async () => {
			const mockSort = vi.fn().mockReturnValue({
				toArray: vi.fn().mockResolvedValue([
					{ _id: "r1", status: "RUNNING" },
				]),
			});
			mockCollection.find.mockReturnValue({ sort: mockSort });

			const result = await repo.listByStatus("RUNNING");
			expect(result).toHaveLength(1);
			expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
		});
	});

	describe("updateStatus", () => {
		it("should update status and extra fields", async () => {
			await repo.updateStatus("r1", "APPROVED", {
				"approval.approvedBy": "admin-1",
			});

			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ _id: "r1" },
				{
					$set: expect.objectContaining({
						status: "APPROVED",
						"approval.approvedBy": "admin-1",
					}),
				},
			);
		});

		it("should include updatedAt timestamp", async () => {
			await repo.updateStatus("r1", "RUNNING");

			const setArg =
				mockCollection.updateOne.mock.calls[0]![1].$set;
			expect(setArg.updatedAt).toBeDefined();
		});
	});
});
