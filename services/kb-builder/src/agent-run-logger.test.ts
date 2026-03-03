import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsertOne = vi.fn().mockResolvedValue({});
const mockFindOne = vi.fn().mockResolvedValue(null);
const mockUpdateOne = vi.fn().mockResolvedValue({});
const mockCollection = {
	insertOne: mockInsertOne,
	findOne: mockFindOne,
	updateOne: mockUpdateOne,
};

vi.mock("./db.js", () => ({
	getDb: () => ({
		collection: () => mockCollection,
	}),
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
			mockInsertOne.mockResolvedValue({});

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
			expect(mockInsertOne).toHaveBeenCalledOnce();
			// Verify _id mapping
			const doc = mockInsertOne.mock.calls[0]![0];
			expect(doc._id).toBe("test-run-id");
		});

		it("should include optional metadata and fullInput", async () => {
			mockInsertOne.mockResolvedValue({});

			const run = await startAgentRun({
				agent: "crawler",
				input: "Crawl source",
				fullInput: "Full crawl config...",
				metadata: { sourceId: "src-1" },
			});

			expect(run.fullInput).toBe("Full crawl config...");
			expect(run.metadata).toEqual({ sourceId: "src-1" });
		});

		it("should not throw if MongoDB fails (logs warning)", async () => {
			mockInsertOne.mockRejectedValue(new Error("MongoDB error"));

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
			mockFindOne.mockResolvedValue({ metadata: { existing: "data" } });
			mockUpdateOne.mockResolvedValue({});

			await completeAgentRun("run-1", {
				output: "Summary completed",
				tokensUsed: 500,
				promptTokens: 300,
				completionTokens: 200,
				durationMs: 2000,
			});

			expect(mockFindOne).toHaveBeenCalledWith({ _id: "run-1" });
			expect(mockUpdateOne).toHaveBeenCalledOnce();
			const [filter, update] = mockUpdateOne.mock.calls[0]!;
			expect(filter).toEqual({ _id: "run-1" });
			expect(update.$set.status).toBe("completed");
			expect(update.$set.output).toBe("Summary completed");
			expect(update.$set.tokensUsed).toBe(500);
		});

		it("should merge existing metadata", async () => {
			mockFindOne.mockResolvedValue({ metadata: { old: "value" } });
			mockUpdateOne.mockResolvedValue({});

			await completeAgentRun("run-1", {
				output: "done",
				metadata: { new: "value" },
			});

			const update = mockUpdateOne.mock.calls[0]![1];
			expect(update.$set.metadata).toEqual({
				old: "value",
				new: "value",
			});
		});

		it("should include fullOutput when provided", async () => {
			mockFindOne.mockResolvedValue({});
			mockUpdateOne.mockResolvedValue({});

			await completeAgentRun("run-1", {
				output: "short",
				fullOutput: "full output text",
			});

			const update = mockUpdateOne.mock.calls[0]![1];
			expect(update.$set.fullOutput).toBe("full output text");
		});

		it("should not throw if MongoDB fails (logs warning)", async () => {
			mockFindOne.mockRejectedValue(new Error("MongoDB unavailable"));

			// Should not throw
			await completeAgentRun("run-1", { output: "done" });
		});
	});

	describe("failAgentRun", () => {
		it("should update run with failure data", async () => {
			mockUpdateOne.mockResolvedValue({});

			await failAgentRun("run-1", "Connection timeout", 5000);

			expect(mockUpdateOne).toHaveBeenCalledOnce();
			const [filter, update] = mockUpdateOne.mock.calls[0]!;
			expect(filter).toEqual({ _id: "run-1" });
			expect(update.$set.status).toBe("failed");
			expect(update.$set.error).toBe("Connection timeout");
			expect(update.$set.durationMs).toBe(5000);
		});

		it("should default durationMs to 0", async () => {
			mockUpdateOne.mockResolvedValue({});

			await failAgentRun("run-1", "Error");

			const update = mockUpdateOne.mock.calls[0]![1];
			expect(update.$set.durationMs).toBe(0);
		});

		it("should not throw if MongoDB fails (logs warning)", async () => {
			mockUpdateOne.mockRejectedValue(new Error("MongoDB error"));

			// Should not throw
			await failAgentRun("run-1", "Error message");
		});
	});
});
