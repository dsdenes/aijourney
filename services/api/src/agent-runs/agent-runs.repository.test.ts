import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentRunsRepository } from "./agent-runs.repository";

// We test the repository with a mock DynamoDB client to verify
// that the correct commands are sent with the right parameters.

const mockSend = vi.fn();
const mockDb = { send: mockSend };

describe("AgentRunsRepository", () => {
	let repo: AgentRunsRepository;

	beforeEach(() => {
		vi.clearAllMocks();
		// Directly instantiate the repo with our mock DynamoDB client
		repo = new AgentRunsRepository(mockDb as any);
	});

	describe("create", () => {
		it("should send PutCommand with the run data", async () => {
			const run = {
				id: "run-1",
				agent: "chat" as const,
				status: "running" as const,
				input: "test",
				createdAt: "2026-01-01T00:00:00Z",
			};
			mockSend.mockResolvedValue({});

			const result = await repo.create(run as any);

			expect(result).toEqual(run);
			expect(mockSend).toHaveBeenCalledOnce();
			const command = mockSend.mock.calls[0][0];
			expect(command.input).toMatchObject({
				TableName: "agent_runs",
				Item: run,
			});
		});
	});

	describe("getById", () => {
		it("should return the item when found", async () => {
			const run = { id: "run-1", agent: "chat" };
			mockSend.mockResolvedValue({ Item: run });

			const result = await repo.getById("run-1");

			expect(result).toEqual(run);
			const command = mockSend.mock.calls[0][0];
			expect(command.input).toMatchObject({
				TableName: "agent_runs",
				Key: { id: "run-1" },
			});
		});

		it("should return undefined when item not found", async () => {
			mockSend.mockResolvedValue({});

			const result = await repo.getById("non-existent");

			expect(result).toBeUndefined();
		});
	});

	describe("update", () => {
		it("should send UpdateCommand with correct expressions", async () => {
			mockSend.mockResolvedValue({});

			await repo.update("run-1", {
				status: "completed" as any,
				output: "done",
				tokensUsed: 100,
			});

			expect(mockSend).toHaveBeenCalledOnce();
			const command = mockSend.mock.calls[0][0];
			expect(command.input.TableName).toBe("agent_runs");
			expect(command.input.Key).toEqual({ id: "run-1" });
			expect(command.input.UpdateExpression).toContain("SET");
			expect(command.input.ExpressionAttributeNames).toHaveProperty(
				"#status",
				"status",
			);
			expect(command.input.ExpressionAttributeValues).toHaveProperty(
				":status",
				"completed",
			);
		});

		it("should skip update when no fields provided", async () => {
			await repo.update("run-1", {});

			expect(mockSend).not.toHaveBeenCalled();
		});

		it("should exclude id from update expression", async () => {
			mockSend.mockResolvedValue({});

			await repo.update("run-1", {
				id: "ignored" as any,
				output: "test",
			} as any);

			const command = mockSend.mock.calls[0][0];
			// Should not contain id in the expression
			expect(command.input.UpdateExpression).not.toContain("id");
		});
	});

	describe("listAll", () => {
		it("should scan with default limit", async () => {
			const runs = [{ id: "1" }, { id: "2" }];
			mockSend.mockResolvedValue({ Items: runs });

			const result = await repo.listAll();

			expect(result).toEqual(runs);
			const command = mockSend.mock.calls[0][0];
			expect(command.input).toMatchObject({
				TableName: "agent_runs",
				Limit: 200,
			});
		});

		it("should use provided limit", async () => {
			mockSend.mockResolvedValue({ Items: [] });

			await repo.listAll(50);

			const command = mockSend.mock.calls[0][0];
			expect(command.input.Limit).toBe(50);
		});

		it("should return empty array when no items", async () => {
			mockSend.mockResolvedValue({ Items: undefined });

			const result = await repo.listAll();

			expect(result).toEqual([]);
		});
	});

	describe("listByAgent", () => {
		it("should query using agent-createdAt-index", async () => {
			const runs = [{ id: "1", agent: "chat" }];
			mockSend.mockResolvedValue({ Items: runs });

			const result = await repo.listByAgent("chat");

			expect(result).toEqual(runs);
			const command = mockSend.mock.calls[0][0];
			expect(command.input).toMatchObject({
				TableName: "agent_runs",
				IndexName: "agent-createdAt-index",
				KeyConditionExpression: "agent = :agent",
				ExpressionAttributeValues: { ":agent": "chat" },
				ScanIndexForward: false,
			});
		});
	});

	describe("listByStatus", () => {
		it("should query using status-createdAt-index", async () => {
			const runs = [{ id: "1", status: "running" }];
			mockSend.mockResolvedValue({ Items: runs });

			const result = await repo.listByStatus("running");

			expect(result).toEqual(runs);
			const command = mockSend.mock.calls[0][0];
			expect(command.input).toMatchObject({
				TableName: "agent_runs",
				IndexName: "status-createdAt-index",
			});
		});
	});
});
