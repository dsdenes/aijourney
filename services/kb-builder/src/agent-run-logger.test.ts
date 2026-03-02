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
	GetCommand: class {
		input: any;
		constructor(input: any) {
			this.input = input;
		}
	},
	UpdateCommand: class {
		input: any;
		constructor(input: any) {
			this.input = input;
		}
	},
}));

vi.mock("./log-stream.js", () => ({
	log: vi.fn(),
}));

vi.mock("@aijourney/shared", async () => {
	const actual = await vi.importActual("@aijourney/shared");
	return {
		...actual,
		generateId: vi.fn().mockReturnValue("test-run-id"),
		nowISO: vi.fn().mockReturnValue("2026-01-15T10:00:00.000Z"),
	};
});

import {
	completeAgentRun,
	failAgentRun,
	startAgentRun,
} from "./agent-run-logger.js";

describe("agent-run-logger", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("startAgentRun", () => {
		it("should create a run with running status", async () => {
			mockSend.mockResolvedValue({});

			const run = await startAgentRun({
				agent: "summarizer",
				input: "Batch summarization",
				model: "gpt-5-mini",
			});

			expect(run.id).toBe("test-run-id");
			expect(run.agent).toBe("summarizer");
			expect(run.status).toBe("running");
			expect(run.input).toBe("Batch summarization");
			expect(run.model).toBe("gpt-5-mini");
			expect(run.createdAt).toBe("2026-01-15T10:00:00.000Z");
			expect(mockSend).toHaveBeenCalledOnce();
		});

		it("should include optional metadata and fullInput", async () => {
			mockSend.mockResolvedValue({});

			const run = await startAgentRun({
				agent: "crawler",
				input: "Crawl source",
				fullInput: "Full crawl config...",
				metadata: { sourceId: "src-1" },
			});

			expect(run.fullInput).toBe("Full crawl config...");
			expect(run.metadata).toEqual({ sourceId: "src-1" });
		});

		it("should not throw if DynamoDB fails (logs warning)", async () => {
			mockSend.mockRejectedValue(new Error("DynamoDB error"));

			const run = await startAgentRun({
				agent: "chat",
				input: "test",
			});

			// Should still return the run even if persist failed
			expect(run.id).toBe("test-run-id");
			expect(run.status).toBe("running");
		});
	});

	describe("completeAgentRun", () => {
		it("should update run with completion data", async () => {
			mockSend
				.mockResolvedValueOnce({ Item: { metadata: { existing: "data" } } }) // GetCommand
				.mockResolvedValueOnce({}); // UpdateCommand

			await completeAgentRun("run-1", {
				output: "Summary completed",
				tokensUsed: 500,
				promptTokens: 300,
				completionTokens: 200,
				durationMs: 2000,
			});

			expect(mockSend).toHaveBeenCalledTimes(2);
			const updateCommand = mockSend.mock.calls[1][0];
			expect(updateCommand.input.UpdateExpression).toContain("#s = :status");
			expect(updateCommand.input.ExpressionAttributeValues[":status"]).toBe(
				"completed",
			);
		});

		it("should merge existing metadata", async () => {
			mockSend
				.mockResolvedValueOnce({ Item: { metadata: { old: "value" } } })
				.mockResolvedValueOnce({});

			await completeAgentRun("run-1", {
				output: "done",
				metadata: { new: "value" },
			});

			const updateCommand = mockSend.mock.calls[1][0];
			expect(updateCommand.input.ExpressionAttributeValues[":meta"]).toEqual({
				old: "value",
				new: "value",
			});
		});

		it("should include fullOutput when provided", async () => {
			mockSend.mockResolvedValueOnce({ Item: {} }).mockResolvedValueOnce({});

			await completeAgentRun("run-1", {
				output: "short",
				fullOutput: "full output text",
			});

			const updateCommand = mockSend.mock.calls[1][0];
			expect(updateCommand.input.UpdateExpression).toContain(
				"fullOutput = :fout",
			);
		});

		it("should not throw if DynamoDB fails (logs warning)", async () => {
			mockSend.mockRejectedValue(new Error("DynamoDB unavailable"));

			// Should not throw
			await completeAgentRun("run-1", { output: "done" });
		});
	});

	describe("failAgentRun", () => {
		it("should update run with failure data", async () => {
			mockSend.mockResolvedValue({});

			await failAgentRun("run-1", "Connection timeout", 5000);

			expect(mockSend).toHaveBeenCalledOnce();
			const command = mockSend.mock.calls[0][0];
			expect(command.input.ExpressionAttributeValues[":status"]).toBe("failed");
			expect(command.input.ExpressionAttributeValues[":error"]).toBe(
				"Connection timeout",
			);
			expect(command.input.ExpressionAttributeValues[":dur"]).toBe(5000);
		});

		it("should default durationMs to 0", async () => {
			mockSend.mockResolvedValue({});

			await failAgentRun("run-1", "Error");

			const command = mockSend.mock.calls[0][0];
			expect(command.input.ExpressionAttributeValues[":dur"]).toBe(0);
		});

		it("should not throw if DynamoDB fails (logs warning)", async () => {
			mockSend.mockRejectedValue(new Error("DynamoDB error"));

			// Should not throw
			await failAgentRun("run-1", "Error message");
		});
	});
});
