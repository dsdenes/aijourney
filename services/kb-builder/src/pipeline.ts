import { runQualityFilter, type QualityResult } from "./quality-filter.js";
import { runSummarization, type SummarizationResult } from "./summarizer.js";
import { runIngestion, type IngestionResult } from "./bedrock-ingestor.js";
import { runRagIngestion, type RagIngestionResult } from "./rag-ingestor.js";
import { getArticlesByStatus } from "./article-repository.js";
import { log } from "./log-stream.js";
import { startAgentRun, completeAgentRun, failAgentRun } from "./agent-run-logger.js";

/**
 * RAG_PROVIDER controls which ingestion backend is used:
 *   - "self"    → Rust chunker + OpenAI embeddings + Qdrant (default)
 *   - "bedrock" → S3 upload for AWS Bedrock Knowledge Bases
 */
export type RagProvider = "self" | "bedrock";

export function getRagProvider(): RagProvider {
	const val = (process.env.RAG_PROVIDER || "self").toLowerCase();
	return val === "bedrock" ? "bedrock" : "self";
}

export interface PipelineProgress {
	status: "idle" | "running" | "completed" | "failed";
	currentStage: string;
	ragProvider: RagProvider;
	stages: {
		qualityFilter: { status: string; result?: QualityResult };
		summarization: { status: string; result?: SummarizationResult };
		ingestion: { status: string; result?: IngestionResult | RagIngestionResult };
	};
	startedAt: string | null;
	completedAt: string | null;
	error?: string;
}

let pipelineProgress: PipelineProgress = createEmptyPipelineProgress();

function createEmptyPipelineProgress(): PipelineProgress {
	return {
		status: "idle",
		currentStage: "",
		ragProvider: getRagProvider(),
		stages: {
			qualityFilter: { status: "pending" },
			summarization: { status: "pending" },
			ingestion: { status: "pending" },
		},
		startedAt: null,
		completedAt: null,
	};
}

export function getPipelineProgress(): PipelineProgress {
	return { ...pipelineProgress };
}

/**
 * Run the full post-crawl pipeline:
 *   1. Quality Filter  — score and gate fetched articles
 *   2. Summarization   — call OpenAI to produce structured summaries
 *   3. Ingestion       — upload to S3 for Bedrock KB
 *
 * Each stage is idempotent: it reads articles by their current status
 * and only processes those in the expected state.
 *
 * Options:
 *   - skipIngestion: skip the S3/Bedrock stage (e.g., no bucket configured)
 */
export async function runPipeline(options?: {
	skipIngestion?: boolean;
}): Promise<PipelineProgress> {
	if (pipelineProgress.status === "running") {
		log("warn", "Pipeline already running, skipping");
		return pipelineProgress;
	}

	pipelineProgress = {
		...createEmptyPipelineProgress(),
		status: "running",
		startedAt: new Date().toISOString(),
	};

	const startTime = Date.now();
	const agentRun = await startAgentRun({
		agent: "pipeline",
		input: `Full pipeline run (provider: ${getRagProvider()}, skipIngestion: ${options?.skipIngestion ?? false})`,
		metadata: { ragProvider: getRagProvider(), skipIngestion: options?.skipIngestion ?? false },
	});

	log("info", "Pipeline started: quality filter → summarization → ingestion", {
		skipIngestion: options?.skipIngestion ?? false,
	});

	try {
		// Stage 1: Quality Filter
		pipelineProgress.currentStage = "quality_filter";
		pipelineProgress.stages.qualityFilter.status = "running";
		log("info", "─── Stage 1/3: Quality Filter ───");

		const qualityResult = await runQualityFilter();
		pipelineProgress.stages.qualityFilter = {
			status: "completed",
			result: qualityResult,
		};

		// Stage 2: Summarization
		// Check for quality_passed articles (may exist from a previous run)
		const qualityPassedArticles = await getArticlesByStatus("quality_passed");
		if (qualityPassedArticles.length === 0) {
			pipelineProgress.stages.summarization.status = "skipped";
			log("info", "─── Stage 2/3: Summarization — SKIPPED (no quality_passed articles) ───");
		} else {
			pipelineProgress.currentStage = "summarization";
			pipelineProgress.stages.summarization.status = "running";
			log("info", `─── Stage 2/3: Summarization (OpenAI) — ${qualityPassedArticles.length} articles ───`);

			const summarizationResult = await runSummarization();
			pipelineProgress.stages.summarization = {
				status: "completed",
				result: summarizationResult,
			};
		}

		// Stage 3: Ingestion
		// Check for summarized articles (may exist from a previous run).
		// For self-hosted RAG, also include "ingested" articles (they may have
		// been uploaded to S3/Bedrock but not yet indexed in Qdrant).
		const summarizedArticles = await getArticlesByStatus("summarized");
		const ragProvider = getRagProvider();
		let articlesForIngestion = summarizedArticles;
		if (ragProvider === "self") {
			const ingestedArticles = await getArticlesByStatus("ingested");
			articlesForIngestion = [...summarizedArticles, ...ingestedArticles];
		}

		if (ragProvider === "bedrock" && options?.skipIngestion) {
			pipelineProgress.stages.ingestion.status = "skipped";
			log("info", "─── Stage 3/3: Ingestion — SKIPPED (no S3 bucket configured) ───");
		} else if (articlesForIngestion.length === 0) {
			pipelineProgress.stages.ingestion.status = "skipped";
			log("info", "─── Stage 3/3: Ingestion — SKIPPED (no articles to ingest) ───");
		} else if (ragProvider === "self") {
			// Self-hosted RAG: Rust chunker → OpenAI embeddings → Qdrant
			pipelineProgress.currentStage = "ingestion";
			pipelineProgress.stages.ingestion.status = "running";
			log("info", `─── Stage 3/3: RAG Ingestion (Qdrant) — ${articlesForIngestion.length} articles ───`);

			const ragResult = await runRagIngestion();
			pipelineProgress.stages.ingestion = {
				status: "completed",
				result: ragResult,
			};
		} else {
			// Bedrock: upload to S3
			pipelineProgress.currentStage = "ingestion";
			pipelineProgress.stages.ingestion.status = "running";
			log("info", `─── Stage 3/3: Ingestion (S3 → Bedrock KB) — ${articlesForIngestion.length} articles ───`);

			const ingestionResult = await runIngestion();
			pipelineProgress.stages.ingestion = {
				status: "completed",
				result: ingestionResult,
			};
		}

		pipelineProgress.status = "completed";
		pipelineProgress.completedAt = new Date().toISOString();
		pipelineProgress.currentStage = "";
		const durationMs = Date.now() - startTime;
		log("info", "Pipeline completed successfully", {
			qualityPassed: qualityResult.passed,
			stages: {
				qualityFilter: pipelineProgress.stages.qualityFilter.status,
				summarization: pipelineProgress.stages.summarization.status,
				ingestion: pipelineProgress.stages.ingestion.status,
			},
		});
		await completeAgentRun(agentRun.id, {
			output: `Pipeline done: QF=${qualityResult.passed} passed, Sum=${pipelineProgress.stages.summarization.status}, Ing=${pipelineProgress.stages.ingestion.status}`,
			durationMs,
			metadata: {
				qualityPassed: qualityResult.passed,
				qualityFailed: qualityResult.failed,
				stages: {
					qualityFilter: pipelineProgress.stages.qualityFilter.status,
					summarization: pipelineProgress.stages.summarization.status,
					ingestion: pipelineProgress.stages.ingestion.status,
				},
			},
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Unknown pipeline error";
		pipelineProgress.status = "failed";
		pipelineProgress.completedAt = new Date().toISOString();
		pipelineProgress.error = msg;
		log("error", `Pipeline failed at stage '${pipelineProgress.currentStage}': ${msg}`);
		await failAgentRun(agentRun.id, msg, Date.now() - startTime);
	}

	return pipelineProgress;
}
