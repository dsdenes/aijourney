import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock all pipeline dependencies
vi.mock("./quality-filter.js", () => ({
	runQualityFilter: vi.fn(),
}));

vi.mock("./summarizer.js", () => ({
	runSummarization: vi.fn(),
}));

vi.mock("./bedrock-ingestor.js", () => ({
	runIngestion: vi.fn(),
}));

vi.mock("./rag-ingestor.js", () => ({
	runRagIngestion: vi.fn(),
}));

vi.mock("./article-repository.js", () => ({
	getArticlesByStatus: vi.fn(),
}));

vi.mock("./log-stream.js", () => ({
	log: vi.fn(),
}));

import { runPipeline, getPipelineProgress } from "./pipeline.js";
import { runQualityFilter } from "./quality-filter.js";
import { runSummarization } from "./summarizer.js";
import { runIngestion } from "./bedrock-ingestor.js";
import { runRagIngestion } from "./rag-ingestor.js";
import { getArticlesByStatus } from "./article-repository.js";

describe("Pipeline", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default to "self" RAG provider for tests
		process.env.RAG_PROVIDER = "self";
	});

	describe("getPipelineProgress", () => {
		it("should return idle status initially", () => {
			const progress = getPipelineProgress();
			expect(progress.status).toMatch(/idle|completed|failed/);
		});

		it("should return a copy of the progress (not a reference)", () => {
			const a = getPipelineProgress();
			const b = getPipelineProgress();
			expect(a).not.toBe(b);
		});
	});

	describe("runPipeline", () => {
		it("should run all three stages successfully", async () => {
			vi.mocked(runQualityFilter).mockResolvedValue({
				passed: 10,
				failed: 2,
				errors: [],
			});
			vi.mocked(getArticlesByStatus).mockImplementation(async (status) => {
				if (status === "quality_passed") return Array(10).fill({ id: "a1" });
				if (status === "summarized") return Array(10).fill({ id: "a1" });
				return [];
			});
			vi.mocked(runSummarization).mockResolvedValue({
				summarized: 10,
				skipped: 0,
				errors: [],
				totalTokensUsed: 5000,
				totalPromptTokens: 0,
				totalCompletionTokens: 0,
			});
			vi.mocked(runRagIngestion).mockResolvedValue({
				ingested: 10,
				skipped: 0,
				totalChunks: 50,
				totalTokensUsed: 1200,
				errors: [],
			});

			const result = await runPipeline();

			expect(result.status).toBe("completed");
			expect(result.stages.qualityFilter.status).toBe("completed");
			expect(result.stages.summarization.status).toBe("completed");
			expect(result.stages.ingestion.status).toBe("completed");
			expect(result.stages.qualityFilter.result!.passed).toBe(10);
			expect(result.stages.summarization.result!.summarized).toBe(10);
			expect(runRagIngestion).toHaveBeenCalled();
			expect(runIngestion).not.toHaveBeenCalled();
			expect(result.startedAt).toBeDefined();
			expect(result.completedAt).toBeDefined();
		});

		it("should skip summarization and ingestion when no articles need processing", async () => {
			vi.mocked(runQualityFilter).mockResolvedValue({
				passed: 0,
				failed: 5,
				errors: [],
			});
			vi.mocked(getArticlesByStatus).mockResolvedValue([]);

			const result = await runPipeline();

			expect(result.status).toBe("completed");
			expect(result.stages.qualityFilter.status).toBe("completed");
			expect(result.stages.summarization.status).toBe("skipped");
			expect(result.stages.ingestion.status).toBe("skipped");
			expect(runSummarization).not.toHaveBeenCalled();
			expect(runIngestion).not.toHaveBeenCalled();
		});

		it("should run ingestion on previously summarized articles even when quality filter passes 0", async () => {
			vi.mocked(runQualityFilter).mockResolvedValue({
				passed: 0,
				failed: 0,
				errors: [],
			});
			vi.mocked(getArticlesByStatus).mockImplementation(async (status) => {
				if (status === "quality_passed") return [];
				if (status === "summarized") return Array(82).fill({ id: "a1" });
				return [];
			});
			vi.mocked(runRagIngestion).mockResolvedValue({
				ingested: 82,
				skipped: 0,
				totalChunks: 410,
				totalTokensUsed: 9000,
				errors: [],
			});

			const result = await runPipeline();

			expect(result.status).toBe("completed");
			expect(result.stages.qualityFilter.status).toBe("completed");
			expect(result.stages.summarization.status).toBe("skipped");
			expect(result.stages.ingestion.status).toBe("completed");
			expect(runSummarization).not.toHaveBeenCalled();
			expect(runRagIngestion).toHaveBeenCalled();
		});

		it("should skip ingestion when no summarized articles remain", async () => {
			vi.mocked(runQualityFilter).mockResolvedValue({
				passed: 5,
				failed: 0,
				errors: [],
			});
			vi.mocked(getArticlesByStatus).mockImplementation(async (status) => {
				if (status === "quality_passed") return Array(5).fill({ id: "a1" });
				if (status === "summarized") return [];
				return [];
			});
			vi.mocked(runSummarization).mockResolvedValue({
				summarized: 0,
				skipped: 0,
				errors: ["All failed"],
				totalTokensUsed: 0,
				totalPromptTokens: 0,
				totalCompletionTokens: 0,
			});

			const result = await runPipeline();

			expect(result.status).toBe("completed");
			expect(result.stages.ingestion.status).toBe("skipped");
			expect(runIngestion).not.toHaveBeenCalled();
			expect(runRagIngestion).not.toHaveBeenCalled();
		});

		it("should skip ingestion when skipIngestion option is true and provider is bedrock", async () => {
			process.env.RAG_PROVIDER = "bedrock";
			vi.mocked(runQualityFilter).mockResolvedValue({
				passed: 5,
				failed: 0,
				errors: [],
			});
			vi.mocked(getArticlesByStatus).mockImplementation(async (status) => {
				if (status === "quality_passed") return Array(5).fill({ id: "a1" });
				if (status === "summarized") return Array(5).fill({ id: "a1" });
				return [];
			});
			vi.mocked(runSummarization).mockResolvedValue({
				summarized: 5,
				skipped: 0,
				errors: [],
				totalTokensUsed: 2500,
				totalPromptTokens: 0,
				totalCompletionTokens: 0,
			});

			const result = await runPipeline({ skipIngestion: true });

			expect(result.status).toBe("completed");
			expect(result.stages.ingestion.status).toBe("skipped");
			expect(runIngestion).not.toHaveBeenCalled();
			expect(runRagIngestion).not.toHaveBeenCalled();
		});

		it("should use Bedrock ingestion when RAG_PROVIDER=bedrock", async () => {
			process.env.RAG_PROVIDER = "bedrock";
			vi.mocked(runQualityFilter).mockResolvedValue({
				passed: 5,
				failed: 0,
				errors: [],
			});
			vi.mocked(getArticlesByStatus).mockImplementation(async (status) => {
				if (status === "quality_passed") return Array(5).fill({ id: "a1" });
				if (status === "summarized") return Array(5).fill({ id: "a1" });
				return [];
			});
			vi.mocked(runSummarization).mockResolvedValue({
				summarized: 5,
				skipped: 0,
				errors: [],
				totalTokensUsed: 2500,
				totalPromptTokens: 0,
				totalCompletionTokens: 0,
			});
			vi.mocked(runIngestion).mockResolvedValue({
				ingested: 5,
				skipped: 0,
				errors: [],
			});

			const result = await runPipeline();

			expect(result.status).toBe("completed");
			expect(result.stages.ingestion.status).toBe("completed");
			expect(runIngestion).toHaveBeenCalled();
			expect(runRagIngestion).not.toHaveBeenCalled();
		});

		it("should handle quality filter failure", async () => {
			vi.mocked(runQualityFilter).mockRejectedValue(
				new Error("MongoDB timeout"),
			);

			const result = await runPipeline();

			expect(result.status).toBe("failed");
			expect(result.error).toContain("MongoDB timeout");
			expect(result.completedAt).toBeDefined();
		});

		it("should handle summarization failure", async () => {
			vi.mocked(runQualityFilter).mockResolvedValue({
				passed: 5,
				failed: 0,
				errors: [],
			});
			vi.mocked(getArticlesByStatus).mockResolvedValue(
				Array(5).fill({ id: "a1" }),
			);
			vi.mocked(runSummarization).mockRejectedValue(
				new Error("OpenAI API down"),
			);

			const result = await runPipeline();

			expect(result.status).toBe("failed");
			expect(result.error).toContain("OpenAI API down");
		});

		it("should record the startedAt timestamp", async () => {
			vi.mocked(runQualityFilter).mockResolvedValue({
				passed: 0,
				failed: 0,
				errors: [],
			});
			vi.mocked(getArticlesByStatus).mockResolvedValue([]);

			const before = new Date().toISOString();
			const result = await runPipeline();
			const after = new Date().toISOString();

			expect(result.startedAt).toBeDefined();
			expect(result.startedAt! >= before).toBe(true);
			expect(result.startedAt! <= after).toBe(true);
		});
	});
});
