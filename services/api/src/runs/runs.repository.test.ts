import { Test, type TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DYNAMODB_CLIENT } from "../dynamodb/dynamodb.module";
import { RunsRepository } from "./runs.repository";

describe("RunsRepository", () => {
	let repo: RunsRepository;
	let mockDb: { send: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		mockDb = { send: vi.fn() };

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				RunsRepository,
				{ provide: DYNAMODB_CLIENT, useValue: mockDb },
			],
		}).compile();

		repo = module.get<RunsRepository>(RunsRepository);
	});

	describe("create", () => {
		it("should put a run request item", async () => {
			const run = {
				id: "r1",
				userId: "u1",
				purpose: "kb_chat",
				status: "PENDING",
			};
			mockDb.send.mockResolvedValue({});

			const result = await repo.create(run as any);
			expect(result).toEqual(run);

			const command = mockDb.send.mock.calls[0]![0];
			expect(command.input.TableName).toBe("run_requests");
		});
	});

	describe("getById", () => {
		it("should return run when found", async () => {
			const run = { id: "r1", status: "PENDING" };
			mockDb.send.mockResolvedValue({ Item: run });

			const result = await repo.getById("r1");
			expect(result).toEqual(run);
		});

		it("should return undefined when not found", async () => {
			mockDb.send.mockResolvedValue({});

			const result = await repo.getById("nonexistent");
			expect(result).toBeUndefined();
		});
	});

	describe("listByUser", () => {
		it("should query userId-status-index GSI", async () => {
			mockDb.send.mockResolvedValue({
				Items: [{ id: "r1" }, { id: "r2" }],
			});

			const result = await repo.listByUser("u1");
			expect(result).toHaveLength(2);

			const command = mockDb.send.mock.calls[0]![0];
			expect(command.input.IndexName).toBe("userId-status-index");
		});
	});

	describe("listByStatus", () => {
		it("should query status-createdAt-index GSI", async () => {
			mockDb.send.mockResolvedValue({
				Items: [{ id: "r1", status: "RUNNING" }],
			});

			const result = await repo.listByStatus("RUNNING");
			expect(result).toHaveLength(1);

			const command = mockDb.send.mock.calls[0]![0];
			expect(command.input.IndexName).toBe("status-createdAt-index");
			expect(command.input.ScanIndexForward).toBe(false);
		});
	});

	describe("updateStatus", () => {
		it("should update status and extra fields", async () => {
			mockDb.send.mockResolvedValue({});

			await repo.updateStatus("r1", "APPROVED", {
				"approval.approvedBy": "admin-1",
			});

			const command = mockDb.send.mock.calls[0]![0];
			expect(command.input.Key).toEqual({ id: "r1" });
			expect(command.input.ExpressionAttributeValues[":status"]).toBe(
				"APPROVED",
			);
			expect(
				command.input.ExpressionAttributeValues[":approval.approvedBy"],
			).toBe("admin-1");
		});

		it("should include updatedAt timestamp", async () => {
			mockDb.send.mockResolvedValue({});

			await repo.updateStatus("r1", "RUNNING");

			const command = mockDb.send.mock.calls[0]![0];
			expect(
				command.input.ExpressionAttributeValues[":updatedAt"],
			).toBeDefined();
		});
	});
});
