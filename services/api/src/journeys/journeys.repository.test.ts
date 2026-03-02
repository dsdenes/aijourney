import { Test, type TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DYNAMODB_CLIENT } from "../dynamodb/dynamodb.module";
import { JourneysRepository } from "./journeys.repository";

describe("JourneysRepository", () => {
	let repo: JourneysRepository;
	let mockDb: { send: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		mockDb = { send: vi.fn() };

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				JourneysRepository,
				{ provide: DYNAMODB_CLIENT, useValue: mockDb },
			],
		}).compile();

		repo = module.get<JourneysRepository>(JourneysRepository);
	});

	describe("create", () => {
		it("should create a journey item", async () => {
			const journey = { id: "j1", userId: "u1", title: "Test Journey" };
			mockDb.send.mockResolvedValue({});

			const result = await repo.create(journey as any);
			expect(result).toEqual(journey);

			const command = mockDb.send.mock.calls[0]![0];
			expect(command.input.TableName).toBe("journeys");
			expect(command.input.ConditionExpression).toBe(
				"attribute_not_exists(id)",
			);
		});
	});

	describe("getById", () => {
		it("should return journey when found", async () => {
			const journey = { id: "j1", title: "Test" };
			mockDb.send.mockResolvedValue({ Item: journey });

			const result = await repo.getById("j1");
			expect(result).toEqual(journey);
		});

		it("should return undefined when not found", async () => {
			mockDb.send.mockResolvedValue({});

			const result = await repo.getById("nonexistent");
			expect(result).toBeUndefined();
		});
	});

	describe("listByUser", () => {
		it("should query by userId using GSI", async () => {
			mockDb.send.mockResolvedValue({
				Items: [
					{ id: "j1", userId: "u1" },
					{ id: "j2", userId: "u1" },
				],
			});

			const result = await repo.listByUser("u1");
			expect(result).toHaveLength(2);

			const command = mockDb.send.mock.calls[0]![0];
			expect(command.input.IndexName).toBe("userId-createdAt-index");
			expect(command.input.ScanIndexForward).toBe(false);
		});
	});

	describe("update", () => {
		it("should construct update expression", async () => {
			mockDb.send.mockResolvedValue({});

			await repo.update("j1", { title: "Updated Title" });

			const command = mockDb.send.mock.calls[0]![0];
			expect(command.input.Key).toEqual({ id: "j1" });
			expect(command.input.ExpressionAttributeValues[":title"]).toBe(
				"Updated Title",
			);
		});

		it("should skip when no fields", async () => {
			await repo.update("j1", {});
			expect(mockDb.send).not.toHaveBeenCalled();
		});
	});
});
