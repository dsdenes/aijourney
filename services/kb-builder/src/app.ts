import express, { type Express } from "express";
import {
	getSources,
	getEnabledSources,
	addSource,
	removeSource,
	updateSource,
} from "./crawl-sources.js";
import { crawlSource, getProgress } from "./crawler.js";
import { getAllArticles, countArticles, getArticlesByStatus, getArticleById, backfillCrawledAt, deleteArticle, updateArticleStatus } from "./article-repository.js";
import { addSSEClient, getLogBuffer, clearLogBuffer, log } from "./log-stream.js";
import { runPipeline, getPipelineProgress, getRagProvider } from "./pipeline.js";
import { getAllSummaries, countSummaries, getSummaryByArticleId, deleteSummaryByArticleId } from "./summary-repository.js";
import { searchKnowledgeBase, isRagAvailable } from "./rag-query.js";
import { deleteVectorsByArticleId } from "./rag-ingestor.js";
import { submitBatchSummarization, checkBatchStatus, getActiveBatches } from "./batch-summarizer.js";

export const app: Express = express();

app.use(express.json());

// --------------- Health & Status ---------------

app.get("/health", (_req, res) => {
	const progress = getProgress();
	const pipelineStatus = getPipelineProgress();
	res.json({
		status: "ok",
		crawl: progress.status,
		pipeline: pipelineStatus.status,
		timestamp: new Date().toISOString(),
	});
});

app.get("/status", async (_req, res) => {
	const progress = getProgress();
	const pipelineStatus = getPipelineProgress();
	const articleCount = await countArticles();
	const summaryCount = await countSummaries();
	res.json({
		crawl: progress,
		pipeline: pipelineStatus,
		totalArticlesStored: articleCount,
		totalSummaries: summaryCount,
	});
});

// --------------- Crawl Sources ---------------

app.get("/sources", (_req, res) => {
	res.json({ data: getSources() });
});

app.post("/sources", (req, res) => {
	const { url, name, enabled = true, maxPages = 100 } = req.body;
	if (!url || !name) {
		res.status(400).json({ error: { code: "VALIDATION", message: "url and name are required" } });
		return;
	}
	const source = addSource({ url, name, enabled, maxPages });
	res.status(201).json({ data: source });
});

app.patch("/sources/:id", (req, res) => {
	const updated = updateSource(req.params.id, req.body);
	if (!updated) {
		res.status(404).json({ error: { code: "NOT_FOUND", message: "Source not found" } });
		return;
	}
	res.json({ data: updated });
});

app.delete("/sources/:id", (req, res) => {
	const removed = removeSource(req.params.id);
	if (!removed) {
		res.status(404).json({ error: { code: "NOT_FOUND", message: "Source not found" } });
		return;
	}
	res.json({ data: { removed: true } });
});

// --------------- Ingestion / Crawling ---------------

app.post("/ingest", async (_req, res) => {
	const progress = getProgress();
	if (progress.status === "running") {
		res.status(409).json({
			error: { code: "ALREADY_RUNNING", message: "A crawl is already in progress" },
		});
		return;
	}

	const sources = getEnabledSources();
	if (sources.length === 0) {
		res.status(400).json({
			error: { code: "NO_SOURCES", message: "No enabled crawl sources configured" },
		});
		return;
	}

	// Start crawl in background (don't await), then run pipeline
	log("info", `Ingestion triggered for ${sources.length} source(s)`, {
		sources: sources.map((s) => ({ id: s.id, name: s.name, url: s.url })),
	});
	void (async () => {
		for (const source of sources) {
			await crawlSource(source);
		}
		// Auto-trigger pipeline after crawl completes
		log("info", "Crawl finished — starting pipeline (quality → summarize → ingest)");
		const skipIngestion = !process.env.KB_S3_BUCKET;
		await runPipeline({ skipIngestion });
	})();

	res.json({
		status: "accepted",
		message: `Crawl started for ${sources.length} source(s)`,
		sources: sources.map((s) => s.name),
	});
});

app.get("/progress", (_req, res) => {
	res.json({ data: getProgress() });
});

// --------------- Log Streaming ---------------

/** SSE endpoint — streams live log entries to connected clients */
app.get("/logs/stream", (req, res) => {
	addSSEClient(res);
	log("info", "SSE client connected", { remoteAddress: req.ip });
});

/** Get buffered log entries (for clients that don't support SSE) */
app.get("/logs", (_req, res) => {
	res.json({ data: getLogBuffer() });
});

/** Clear the log buffer */
app.delete("/logs", (_req, res) => {
	clearLogBuffer();
	res.json({ data: { cleared: true } });
});

// --------------- Articles ---------------

app.get("/articles", async (_req, res) => {
	const articles = await getAllArticles();
	res.json({ data: articles, meta: { total: articles.length } });
});

app.get("/articles/by-status/:status", async (req, res) => {
	const status = req.params.status;
	const articles = await getArticlesByStatus(status as any);
	res.json({ data: articles, meta: { total: articles.length } });
});

// --------------- Pipeline (post-crawl processing) ---------------

/** Trigger the pipeline manually (quality → summarize → ingest) */
app.post("/pipeline", async (_req, res) => {
	const pipelineStatus = getPipelineProgress();
	if (pipelineStatus.status === "running") {
		res.status(409).json({
			error: { code: "ALREADY_RUNNING", message: "Pipeline is already running" },
		});
		return;
	}

	// Backfill crawledAt for articles that are missing it (required for GSI)
	const backfilled = await backfillCrawledAt();
	if (backfilled > 0) {
		log("info", `Backfilled crawledAt for ${backfilled} articles`);
	}

	const skipIngestion = !process.env.KB_S3_BUCKET;
	const ragProvider = getRagProvider();
	log("info", "Pipeline triggered manually", { skipIngestion, ragProvider });
	void runPipeline({ skipIngestion });

	res.json({
		status: "accepted",
		message: `Pipeline started (quality → summarize → ${ragProvider === "self" ? "Qdrant RAG" : "S3/Bedrock"})`,
		skipIngestion,
	});
});

/** Get pipeline progress */
app.get("/pipeline/progress", (_req, res) => {
	res.json({ data: getPipelineProgress() });
});

// --------------- Summaries ---------------

/** Trigger summarization directly (with optional limit) */
app.post("/summarize", async (req, res) => {
	const limit = Number(req.body?.limit) || 0;

	log("info", `Summarization triggered manually${limit > 0 ? ` (limit: ${limit})` : " (unlimited)"}`);

	// Run asynchronously so the HTTP request returns immediately
	const { runSummarization } = await import("./summarizer.js");
	runSummarization(limit)
		.then((result) => {
			log("info", `Summarization finished: ${result.summarized} done, ${result.skipped} skipped, ${result.errors.length} errors, ${result.totalTokensUsed} tokens`);
		})
		.catch((err) => {
			log("error", `Summarization failed: ${err instanceof Error ? err.message : String(err)}`);
		});

	res.json({
		status: "accepted",
		message: `Summarization started${limit > 0 ? ` for up to ${limit} articles` : " for all quality_passed articles"}`,
		limit: limit || "unlimited",
	});
});

app.get("/summaries", async (_req, res) => {
	const summaries = await getAllSummaries();
	res.json({ data: summaries, meta: { total: summaries.length } });
});

// --------------- RAG Query ---------------

/** Semantic search over the Qdrant knowledge base */
app.post("/rag/query", async (req, res) => {
	const { query, topK = 8, scoreThreshold = 0.3 } = req.body;
	if (!query || typeof query !== "string") {
		res.status(400).json({
			error: { code: "VALIDATION", message: "query (string) is required" },
		});
		return;
	}

	try {
		const result = await searchKnowledgeBase(query, topK, scoreThreshold);
		res.json({ data: result });
	} catch (err) {
		log("error", `RAG query failed: ${err instanceof Error ? err.message : String(err)}`);
		res.status(500).json({
			error: { code: "RAG_QUERY_FAILED", message: err instanceof Error ? err.message : "Search failed" },
		});
	}
});

/** Check if the RAG knowledge base is available and has data */
app.get("/rag/status", async (_req, res) => {
	const available = await isRagAvailable();
	const provider = getRagProvider();
	res.json({ data: { available, provider } });
});

// --------------- Article Deletion ---------------

/** Delete an article and its associated summary + vectors */
app.delete("/articles/:id", async (req, res) => {
	const { id } = req.params;

	try {
		const article = await getArticleById(id);
		if (!article) {
			res.status(404).json({
				error: { code: "NOT_FOUND", message: "Article not found" },
			});
			return;
		}

		// Delete vectors from Qdrant
		const vectorsDeleted = await deleteVectorsByArticleId(id);

		// Delete summary from DynamoDB
		const summaryDeleted = await deleteSummaryByArticleId(id);

		// Delete article from DynamoDB
		await deleteArticle(id);

		log("info", `Deleted article ${id} (${article.title.slice(0, 60)})`, {
			articleId: id,
			vectorsDeleted,
			summaryDeleted,
		});

		res.json({
			data: {
				deleted: true,
				articleId: id,
				title: article.title,
				vectorsDeleted,
				summaryDeleted,
			},
		});
	} catch (err) {
		log("error", `Failed to delete article ${id}: ${err instanceof Error ? err.message : String(err)}`);
		res.status(500).json({
			error: { code: "DELETE_FAILED", message: err instanceof Error ? err.message : "Delete failed" },
		});
	}
});

// --------------- Reset Summaries ---------------

/** Delete all summaries and reset article status back to quality_passed so they can be re-processed */
app.post("/articles/reset-summaries", async (_req, res) => {
	try {
		const allSummaries = await getAllSummaries();
		const allArticles = await getAllArticles();

		let summariesDeleted = 0;
		let vectorsDeleted = 0;
		let articlesReset = 0;

		// Delete all summaries
		for (const summary of allSummaries) {
			await deleteSummaryByArticleId(summary.articleId);
			summariesDeleted++;
		}

		// Delete all vectors from Qdrant
		for (const article of allArticles) {
			if (article.status === "summarized" || article.status === "ingested") {
				const deleted = await deleteVectorsByArticleId(article.id);
				vectorsDeleted += deleted;
			}
		}

		// Reset summarized/ingested articles back to quality_passed
		for (const article of allArticles) {
			if (article.status === "summarized" || article.status === "ingested") {
				await updateArticleStatus(article.id, "quality_passed");
				articlesReset++;
			}
		}

		log("info", `Reset summaries: ${summariesDeleted} summaries deleted, ${vectorsDeleted} vectors deleted, ${articlesReset} articles reset to quality_passed`);

		res.json({
			data: {
				summariesDeleted,
				vectorsDeleted,
				articlesReset,
			},
		});
	} catch (err) {
		log("error", `Failed to reset summaries: ${err instanceof Error ? err.message : String(err)}`);
		res.status(500).json({
			error: { code: "RESET_FAILED", message: err instanceof Error ? err.message : "Reset failed" },
		});
	}
});

// --------------- Batch Summarization ---------------

/** Submit a batch summarization job (50% cheaper via OpenAI Batch API) */
app.post("/batch-summarize", async (req, res) => {
	const mode = (req.body?.mode || "new") as "new" | "all" | "resummarize";
	if (!["new", "all", "resummarize"].includes(mode)) {
		res.status(400).json({
			error: { code: "VALIDATION", message: "mode must be 'new', 'all', or 'resummarize'" },
		});
		return;
	}

	try {
		const result = await submitBatchSummarization(mode);
		if (!result.batchId) {
			res.json({
				data: {
					status: "no_articles",
					message: "No articles to summarize",
					skipped: result.skipped,
					errors: result.errors,
				},
			});
			return;
		}

		res.json({
			data: {
				status: "submitted",
				batchId: result.batchId,
				articleCount: result.articleCount,
				skipped: result.skipped,
				errors: result.errors,
				message: `Batch submitted with ${result.articleCount} articles. Poll /batch-summarize/${result.batchId} for status.`,
			},
		});
	} catch (err) {
		log("error", `Batch summarization failed: ${err instanceof Error ? err.message : String(err)}`);
		res.status(500).json({
			error: { code: "BATCH_FAILED", message: err instanceof Error ? err.message : "Batch failed" },
		});
	}
});

/** Check batch summarization status */
app.get("/batch-summarize/:batchId", async (req, res) => {
	try {
		const status = await checkBatchStatus(req.params.batchId);
		res.json({ data: status });
	} catch (err) {
		res.status(500).json({
			error: { code: "STATUS_FAILED", message: err instanceof Error ? err.message : "Status check failed" },
		});
	}
});

/** List active batch jobs */
app.get("/batch-summarize", (_req, res) => {
	res.json({ data: getActiveBatches() });
});
