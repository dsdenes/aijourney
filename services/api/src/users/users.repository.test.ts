import { Test, type TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DYNAMODB_CLIENT } from "../dynamodb/dynamodb.module";
import { UsersRepository } from "./users.repository";

describe("UsersRepository", () => {
	let repo: UsersRepository;
	let mockDb: { send: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		mockDb = { send: vi.fn() };

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				UsersRepository,
				{ provide: DYNAMODB_CLIENT, useValue: mockDb },
			],
		}).compile();

		repo = module.get<UsersRepository>(UsersRepository);
	});

	describe("create", () => {
		it("should put an item in DynamoDB and return it", async () => {
			const user = {
				id: "u1",
				email: "test@mito.hu",
				name: "Test",
				googleId: "g1",
				role: "employee" as const,
				onboardingComplete: false,
				preferences: {},
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
				lastLoginAt: "2025-01-01T00:00:00Z",
			};

			mockDb.send.mockResolvedValue({});
			const result = await repo.create(user);

			expect(result).toEqual(user);
			expect(mockDb.send).toHaveBeenCalledOnce();
			const command = mockDb.send.mock.calls[0]![0];
			expect(command.input.TableName).toBe("users");
			expect(command.input.Item).toEqual(user);
			expect(command.input.ConditionExpression).toBe(
				"attribute_not_exists(id)",
			);
		});
	});

	describe("getById", () => {
		it("should return user when found", async () => {
			const user = { id: "u1", email: "test@mito.hu" };
			mockDb.send.mockResolvedValue({ Item: user });

			const result = await repo.getById("u1");
			expect(result).toEqual(user);
		});

		it("should return undefined when not found", async () => {
			mockDb.send.mockResolvedValue({});

			const result = await repo.getById("nonexistent");
			expect(result).toBeUndefined();
		});
	});

	describe("getByEmail", () => {
		it("should query email-index GSI", async () => {
			const user = { id: "u1", email: "test@mito.hu" };
			mockDb.send.mockResolvedValue({ Items: [user] });

			const result = await repo.getByEmail("test@mito.hu");
			expect(result).toEqual(user);

			const command = mockDb.send.mock.calls[0]![0];
			expect(command.input.IndexName).toBe("email-index");
		});

		it("should return undefined when no match", async () => {
			mockDb.send.mockResolvedValue({ Items: [] });

			const result = await repo.getByEmail("nobody@mito.hu");
			expect(result).toBeUndefined();
		});
	});

	describe("update", () => {
		it("should construct correct update expression", async () => {
			mockDb.send.mockResolvedValue({});

			await repo.update("u1", { name: "New Name", department: "Engineering" });

			const command = mockDb.send.mock.calls[0]![0];
			expect(command.input.Key).toEqual({ id: "u1" });
			expect(command.input.UpdateExpression).toContain("#name = :name");
			expect(command.input.UpdateExpression).toContain(
				"#department = :department",
			);
			expect(command.input.ExpressionAttributeValues[":name"]).toBe("New Name");
		});

		it("should skip if no fields to update", async () => {
			await repo.update("u1", {});
			expect(mockDb.send).not.toHaveBeenCalled();
		});

		it("should filter out id from updates", async () => {
			mockDb.send.mockResolvedValue({});

			await repo.update("u1", { id: "u1", name: "X" } as any);

			const command = mockDb.send.mock.calls[0]![0];
			expect(command.input.UpdateExpression).not.toContain("#id");
		});
	});

	describe("listAll", () => {
		it("should scan table with limit", async () => {
			mockDb.send.mockResolvedValue({ Items: [{ id: "u1" }, { id: "u2" }] });

			const result = await repo.listAll();
			expect(result).toHaveLength(2);

			const command = mockDb.send.mock.calls[0]![0];
			expect(command.input.TableName).toBe("users");
			expect(command.input.Limit).toBe(50);
		});

		it("should return empty array when no items", async () => {
			mockDb.send.mockResolvedValue({ Items: undefined });

			const result = await repo.listAll();
			expect(result).toEqual([]);
		});
	});
});
