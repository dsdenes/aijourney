import { Test, type TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MONGODB_DB } from "../mongodb/mongodb.module";
import { TenantsRepository } from "./tenants.repository";

describe("TenantsRepository", () => {
	let repo: TenantsRepository;
	let mockCollection: Record<string, ReturnType<typeof vi.fn>>;

	beforeEach(async () => {
		mockCollection = {
			insertOne: vi.fn().mockResolvedValue({}),
			findOne: vi.fn().mockResolvedValue(null),
			updateOne: vi.fn().mockResolvedValue({}),
			deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
			countDocuments: vi.fn().mockResolvedValue(0),
			find: vi.fn().mockReturnValue({
				sort: vi.fn().mockReturnValue({
					limit: vi.fn().mockReturnValue({
						toArray: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				TenantsRepository,
				{
					provide: MONGODB_DB,
					useValue: { collection: vi.fn().mockReturnValue(mockCollection) },
				},
			],
		}).compile();

		repo = module.get<TenantsRepository>(TenantsRepository);
	});

	describe("create", () => {
		it("should insert a tenant document with _id = id", async () => {
			const tenant = {
				id: "t1",
				name: "Mito",
				slug: "mito",
				plan: "free" as const,
				settings: {},
				quotas: {
					maxUsers: 3,
					maxLlmCallsPerMonth: 100,
					additionalLlmCalls: 0,
				},
				usage: {
					currentPeriodStart: "2026-01-01",
					llmCallsUsed: 0,
					lastResetAt: "2026-01-01",
				},
				createdAt: "2026-01-01",
				updatedAt: "2026-01-01",
			};

			const result = await repo.create(tenant);
			expect(result).toEqual(tenant);
			expect(mockCollection.insertOne).toHaveBeenCalledWith(
				expect.objectContaining({ _id: "t1", name: "Mito", slug: "mito" }),
			);
		});
	});

	describe("getById", () => {
		it("should return tenant when found", async () => {
			mockCollection.findOne.mockResolvedValue({
				_id: "t1",
				name: "Mito",
				slug: "mito",
			});
			const result = await repo.getById("t1");
			expect(result).toEqual({ id: "t1", name: "Mito", slug: "mito" });
			expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: "t1" });
		});

		it("should return undefined when not found", async () => {
			const result = await repo.getById("nonexistent");
			expect(result).toBeUndefined();
		});
	});

	describe("getBySlug", () => {
		it("should find by slug field", async () => {
			mockCollection.findOne.mockResolvedValue({ _id: "t1", slug: "mito" });
			const result = await repo.getBySlug("mito");
			expect(result).toEqual({ id: "t1", slug: "mito" });
			expect(mockCollection.findOne).toHaveBeenCalledWith({ slug: "mito" });
		});

		it("should return undefined for unknown slug", async () => {
			const result = await repo.getBySlug("unknown");
			expect(result).toBeUndefined();
		});
	});

	describe("update", () => {
		it("should call updateOne with $set excluding id", async () => {
			await repo.update("t1", { name: "New Name" });
			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ _id: "t1" },
				{ $set: { name: "New Name" } },
			);
		});

		it("should skip when only id is passed", async () => {
			await repo.update("t1", { id: "t1" } as any);
			expect(mockCollection.updateOne).not.toHaveBeenCalled();
		});

		it("should skip when no fields", async () => {
			await repo.update("t1", {});
			expect(mockCollection.updateOne).not.toHaveBeenCalled();
		});
	});

	describe("delete", () => {
		it("should delete by _id", async () => {
			await repo.delete("t1");
			expect(mockCollection.deleteOne).toHaveBeenCalledWith({ _id: "t1" });
		});
	});

	describe("listAll", () => {
		it("should return tenants sorted by createdAt desc with limit", async () => {
			const mockLimit = vi.fn().mockReturnValue({
				toArray: vi.fn().mockResolvedValue([
					{ _id: "t2", name: "B" },
					{ _id: "t1", name: "A" },
				]),
			});
			const mockSort = vi.fn().mockReturnValue({ limit: mockLimit });
			mockCollection.find.mockReturnValue({ sort: mockSort });

			const result = await repo.listAll(50);
			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({ id: "t2", name: "B" });
			expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
			expect(mockLimit).toHaveBeenCalledWith(50);
		});

		it("should default to limit 100", async () => {
			const mockLimit = vi
				.fn()
				.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
			const mockSort = vi.fn().mockReturnValue({ limit: mockLimit });
			mockCollection.find.mockReturnValue({ sort: mockSort });

			await repo.listAll();
			expect(mockLimit).toHaveBeenCalledWith(100);
		});
	});

	describe("incrementUsage", () => {
		it("should $inc the given field and $set updatedAt", async () => {
			await repo.incrementUsage("t1", "usage.llmCallsUsed", 5);
			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ _id: "t1" },
				{
					$inc: expect.objectContaining({ "usage.llmCallsUsed": 5 }),
					$set: { updatedAt: expect.any(String) },
				},
			);
		});
	});

	describe("updateRaw", () => {
		it("should $set arbitrary dot-notation fields", async () => {
			await repo.updateRaw("t1", { "quotas.additionalLlmCalls": 2000 });
			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ _id: "t1" },
				{
					$set: expect.objectContaining({
						"quotas.additionalLlmCalls": 2000,
						updatedAt: expect.any(String),
					}),
				},
			);
		});
	});

	describe("resetUsage", () => {
		it("should zero out usage and set timestamps", async () => {
			await repo.resetUsage("t1");
			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ _id: "t1" },
				{
					$set: {
						"usage.llmCallsUsed": 0,
						"usage.currentPeriodStart": expect.any(String),
						"usage.lastResetAt": expect.any(String),
						updatedAt: expect.any(String),
					},
				},
			);
		});
	});

	describe("updatePlan", () => {
		it("should set plan and quotas", async () => {
			await repo.updatePlan("t1", "pro", {
				maxUsers: 25,
				maxLlmCallsPerMonth: 5000,
			});
			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ _id: "t1" },
				{
					$set: {
						plan: "pro",
						"quotas.maxUsers": 25,
						"quotas.maxLlmCallsPerMonth": 5000,
						updatedAt: expect.any(String),
					},
				},
			);
		});
	});

	describe("count", () => {
		it("should return document count", async () => {
			mockCollection.countDocuments.mockResolvedValue(7);
			const result = await repo.count();
			expect(result).toBe(7);
		});
	});
});
