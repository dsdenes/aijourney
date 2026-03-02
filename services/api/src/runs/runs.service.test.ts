import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RunsRepository } from "./runs.repository";
import { RunsService } from "./runs.service";

describe("RunsService", () => {
	let service: RunsService;
	let repo: Record<string, ReturnType<typeof vi.fn>>;

	beforeEach(async () => {
		repo = {
			create: vi.fn(),
			getById: vi.fn(),
			listByUser: vi.fn(),
			listByStatus: vi.fn(),
			updateStatus: vi.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [RunsService, { provide: RunsRepository, useValue: repo }],
		}).compile();

		service = module.get<RunsService>(RunsService);
	});

	describe("create", () => {
		it("should auto-approve kb_chat runs", async () => {
			repo.create.mockImplementation((run: unknown) => Promise.resolve(run));

			const result = await service.create("u1", {
				purpose: "kb_chat",
				inputs: { promptHash: "sha256-abc" },
			});

			expect(result.status).toBe("APPROVED");
			expect(result.approval.autoApproved).toBe(true);
			expect(result.approval.requiredApproval).toBe(false);
			expect(result.approval.approvedAt).toBeDefined();
		});

		it("should auto-approve personalization runs", async () => {
			repo.create.mockImplementation((run: unknown) => Promise.resolve(run));

			const result = await service.create("u1", {
				purpose: "personalization",
				inputs: { promptHash: "sha256-def" },
			});

			expect(result.status).toBe("APPROVED");
			expect(result.approval.autoApproved).toBe(true);
		});

		it("should require approval for summarization runs", async () => {
			repo.create.mockImplementation((run: unknown) => Promise.resolve(run));

			const result = await service.create("u1", {
				purpose: "summarization",
				inputs: { promptHash: "sha256-ghi" },
			});

			expect(result.status).toBe("PENDING");
			expect(result.approval.requiredApproval).toBe(true);
			expect(result.approval.autoApproved).toBe(false);
		});

		it("should require approval for kb_ingestion runs", async () => {
			repo.create.mockImplementation((run: unknown) => Promise.resolve(run));

			const result = await service.create("u1", {
				purpose: "kb_ingestion",
				inputs: { promptHash: "sha256-jkl" },
			});

			expect(result.status).toBe("PENDING");
			expect(result.approval.requiredApproval).toBe(true);
		});

		it("should use default budget when none provided", async () => {
			repo.create.mockImplementation((run: unknown) => Promise.resolve(run));

			const result = await service.create("u1", {
				purpose: "kb_chat",
				inputs: { promptHash: "hash" },
			});

			expect(result.budget).toBeDefined();
			expect(result.budget.maxTokens).toBe(4000); // DEFAULT_BUDGETS.kb_chat
			expect(result.budget.maxDurationMs).toBe(30000);
		});

		it("should use provided budget when specified", async () => {
			repo.create.mockImplementation((run: unknown) => Promise.resolve(run));

			const result = await service.create("u1", {
				purpose: "kb_chat",
				inputs: { promptHash: "hash" },
				budget: {
					maxTokens: 8000,
					maxDurationMs: 60000,
					estimatedCostUsd: 0.1,
				},
			});

			expect(result.budget.maxTokens).toBe(8000);
		});

		it("should generate a ULID", async () => {
			repo.create.mockImplementation((run: unknown) => Promise.resolve(run));

			const result = await service.create("u1", {
				purpose: "kb_chat",
				inputs: { promptHash: "hash" },
			});

			expect(result.id).toHaveLength(26);
		});
	});

	describe("getById", () => {
		it("should return run when found", async () => {
			const run = { id: "r1", status: "PENDING" };
			repo.getById.mockResolvedValue(run);

			const result = await service.getById("r1");
			expect(result).toEqual(run);
		});

		it("should throw NotFoundException when not found", async () => {
			repo.getById.mockResolvedValue(undefined);

			await expect(service.getById("nonexistent")).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	describe("transition", () => {
		it("should allow valid transitions (PENDING -> APPROVED)", async () => {
			const run = { id: "r1", status: "PENDING" };
			repo.getById.mockResolvedValue(run);
			repo.updateStatus.mockResolvedValue(undefined);

			// After transition, getById is called again which should return updated
			repo.getById
				.mockResolvedValueOnce(run)
				.mockResolvedValueOnce({ ...run, status: "APPROVED" });

			const result = await service.transition("r1", "APPROVED");
			expect(result.status).toBe("APPROVED");
			expect(repo.updateStatus).toHaveBeenCalledWith("r1", "APPROVED", {});
		});

		it("should reject invalid transitions (PENDING -> RUNNING)", async () => {
			const run = { id: "r1", status: "PENDING" };
			repo.getById.mockResolvedValue(run);

			await expect(service.transition("r1", "RUNNING")).rejects.toThrow(
				BadRequestException,
			);
		});

		it("should reject transitions from terminal states", async () => {
			const run = { id: "r1", status: "COMPLETED" };
			repo.getById.mockResolvedValue(run);

			await expect(service.transition("r1", "RUNNING")).rejects.toThrow(
				BadRequestException,
			);
		});
	});

	describe("approve", () => {
		it("should transition PENDING to APPROVED with approver", async () => {
			const run = { id: "r1", status: "PENDING" };
			repo.getById
				.mockResolvedValueOnce(run)
				.mockResolvedValueOnce({ ...run, status: "APPROVED" });
			repo.updateStatus.mockResolvedValue(undefined);

			const result = await service.approve("r1", "admin-1");
			expect(result.status).toBe("APPROVED");
			expect(repo.updateStatus).toHaveBeenCalledWith(
				"r1",
				"APPROVED",
				expect.objectContaining({
					"approval.approvedBy": "admin-1",
				}),
			);
		});
	});

	describe("reject", () => {
		it("should transition PENDING to REJECTED", async () => {
			const run = { id: "r1", status: "PENDING" };
			repo.getById
				.mockResolvedValueOnce(run)
				.mockResolvedValueOnce({ ...run, status: "REJECTED" });
			repo.updateStatus.mockResolvedValue(undefined);

			const result = await service.reject("r1");
			expect(result.status).toBe("REJECTED");
		});
	});

	describe("cancel", () => {
		it("should transition RUNNING to CANCEL_REQUESTED", async () => {
			const run = { id: "r1", status: "RUNNING" };
			repo.getById
				.mockResolvedValueOnce(run) // first call in cancel
				.mockResolvedValueOnce(run) // second call in transition
				.mockResolvedValueOnce({ ...run, status: "CANCEL_REQUESTED" }); // after update
			repo.updateStatus.mockResolvedValue(undefined);

			const result = await service.cancel("r1", "u1");
			expect(result.status).toBe("CANCEL_REQUESTED");
		});

		it("should transition APPROVED directly to CANCELLED", async () => {
			const run = { id: "r1", status: "APPROVED" };
			repo.getById
				.mockResolvedValueOnce(run) // first call in cancel
				.mockResolvedValueOnce(run) // second call in transition
				.mockResolvedValueOnce({ ...run, status: "CANCELLED" }); // after update
			repo.updateStatus.mockResolvedValue(undefined);

			const result = await service.cancel("r1", "u1");
			expect(result.status).toBe("CANCELLED");
		});

		it("should include cancelledBy and cancelledAt in extra", async () => {
			const run = { id: "r1", status: "APPROVED" };
			repo.getById
				.mockResolvedValueOnce(run)
				.mockResolvedValueOnce(run)
				.mockResolvedValueOnce({ ...run, status: "CANCELLED" });
			repo.updateStatus.mockResolvedValue(undefined);

			await service.cancel("r1", "u1");

			expect(repo.updateStatus).toHaveBeenCalledWith(
				"r1",
				"CANCELLED",
				expect.objectContaining({
					cancelledBy: "u1",
					cancelledAt: expect.any(String),
				}),
			);
		});
	});

	describe("listByUser", () => {
		it("should delegate to repository", async () => {
			repo.listByUser.mockResolvedValue([{ id: "r1" }]);

			const result = await service.listByUser("u1");
			expect(result).toHaveLength(1);
			expect(repo.listByUser).toHaveBeenCalledWith("u1");
		});
	});
});
