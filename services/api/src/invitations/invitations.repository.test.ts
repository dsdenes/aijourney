import { Test, type TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MONGODB_DB } from "../mongodb/mongodb.module";
import { InvitationsRepository } from "./invitations.repository";

describe("InvitationsRepository", () => {
	let repo: InvitationsRepository;
	let mockCollection: Record<string, ReturnType<typeof vi.fn>>;

	beforeEach(async () => {
		mockCollection = {
			insertOne: vi.fn().mockResolvedValue({}),
			findOne: vi.fn().mockResolvedValue(null),
			updateOne: vi.fn().mockResolvedValue({}),
			deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
			countDocuments: vi.fn().mockResolvedValue(0),
			find: vi.fn().mockReturnValue({
				sort: vi.fn().mockReturnValue({
					toArray: vi.fn().mockResolvedValue([]),
				}),
			}),
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				InvitationsRepository,
				{
					provide: MONGODB_DB,
					useValue: { collection: vi.fn().mockReturnValue(mockCollection) },
				},
			],
		}).compile();

		repo = module.get<InvitationsRepository>(InvitationsRepository);
	});

	describe("create", () => {
		it("should insert document with _id = id", async () => {
			const inv = {
				id: "inv1",
				tenantId: "t1",
				email: "a@b.com",
				orgRole: "member" as const,
				invitedBy: "u1",
				status: "pending" as const,
				token: "tok123",
				expiresAt: "2026-02-01",
				createdAt: "2026-01-01",
			};
			const result = await repo.create(inv);
			expect(result).toEqual(inv);
			expect(mockCollection.insertOne).toHaveBeenCalledWith(
				expect.objectContaining({ _id: "inv1", email: "a@b.com" }),
			);
		});
	});

	describe("getById", () => {
		it("should return invitation when found", async () => {
			mockCollection.findOne.mockResolvedValue({
				_id: "inv1",
				email: "a@b.com",
			});
			const result = await repo.getById("inv1");
			expect(result).toEqual({ id: "inv1", email: "a@b.com" });
		});

		it("should return undefined when not found", async () => {
			const result = await repo.getById("nonexistent");
			expect(result).toBeUndefined();
		});
	});

	describe("getByToken", () => {
		it("should find by token", async () => {
			mockCollection.findOne.mockResolvedValue({
				_id: "inv1",
				token: "tok123",
			});
			const result = await repo.getByToken("tok123");
			expect(result).toEqual({ id: "inv1", token: "tok123" });
			expect(mockCollection.findOne).toHaveBeenCalledWith({ token: "tok123" });
		});

		it("should return undefined for unknown token", async () => {
			const result = await repo.getByToken("unknown");
			expect(result).toBeUndefined();
		});
	});

	describe("getByEmail", () => {
		it("should find pending invitations for email", async () => {
			const mockToArray = vi.fn().mockResolvedValue([
				{ _id: "inv1", email: "a@b.com" },
				{ _id: "inv2", email: "a@b.com" },
			]);
			const mockSort = vi.fn().mockReturnValue({ toArray: mockToArray });
			mockCollection.find.mockReturnValue({ sort: mockSort });

			const result = await repo.getByEmail("a@b.com");
			expect(result).toHaveLength(2);
			expect(mockCollection.find).toHaveBeenCalledWith({
				email: "a@b.com",
				status: "pending",
			});
		});
	});

	describe("getByTenant", () => {
		it("should find invitations for tenant", async () => {
			const mockToArray = vi
				.fn()
				.mockResolvedValue([{ _id: "inv1", tenantId: "t1" }]);
			const mockSort = vi.fn().mockReturnValue({ toArray: mockToArray });
			mockCollection.find.mockReturnValue({ sort: mockSort });

			const result = await repo.getByTenant("t1");
			expect(result).toHaveLength(1);
			expect(mockCollection.find).toHaveBeenCalledWith({ tenantId: "t1" });
		});
	});

	describe("updateStatus", () => {
		it("should update status with $set", async () => {
			await repo.updateStatus("inv1", "accepted", { acceptedAt: "2026-01-02" });
			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ _id: "inv1" },
				{ $set: { status: "accepted", acceptedAt: "2026-01-02" } },
			);
		});

		it("should handle no extra fields", async () => {
			await repo.updateStatus("inv1", "revoked");
			expect(mockCollection.updateOne).toHaveBeenCalledWith(
				{ _id: "inv1" },
				{ $set: { status: "revoked" } },
			);
		});
	});

	describe("deleteExpired", () => {
		it("should delete pending invitations that are past expiresAt", async () => {
			mockCollection.deleteMany.mockResolvedValue({ deletedCount: 3 });
			const result = await repo.deleteExpired();
			expect(result).toBe(3);
			expect(mockCollection.deleteMany).toHaveBeenCalledWith({
				status: "pending",
				expiresAt: { $lt: expect.any(String) },
			});
		});
	});

	describe("countPendingByTenant", () => {
		it("should count pending invitations for tenant", async () => {
			mockCollection.countDocuments.mockResolvedValue(5);
			const result = await repo.countPendingByTenant("t1");
			expect(result).toBe(5);
			expect(mockCollection.countDocuments).toHaveBeenCalledWith({
				tenantId: "t1",
				status: "pending",
			});
		});
	});

	describe("getByEmailAndTenant", () => {
		it("should find pending invitation for email+tenant", async () => {
			mockCollection.findOne.mockResolvedValue({
				_id: "inv1",
				email: "a@b.com",
				tenantId: "t1",
			});
			const result = await repo.getByEmailAndTenant("a@b.com", "t1");
			expect(result).toEqual({ id: "inv1", email: "a@b.com", tenantId: "t1" });
			expect(mockCollection.findOne).toHaveBeenCalledWith({
				email: "a@b.com",
				tenantId: "t1",
				status: "pending",
			});
		});

		it("should return undefined when not found", async () => {
			const result = await repo.getByEmailAndTenant("nobody@b.com", "t1");
			expect(result).toBeUndefined();
		});
	});
});
