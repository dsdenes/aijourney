/**
 * RAG ingestor — Rust chunker + Pinecone integrated embedding:
 *   1. Rust binary for fast paragraph-aware text splitting
 *   2. Pinecone integrated multilingual-e5-large for embedding (no OpenAI)
 *   3. Pinecone serverless index for vector storage + similarity search
 *
 * Each "summarized" article gets its formatted summary text chunked
 * and upserted into Pinecone where the embedding is done server-side.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Article, Summary } from "@aijourney/shared";
import { Pinecone } from "@pinecone-database/pinecone";
import {
	getArticlesByStatus,
	updateArticleStatus,
} from "./article-repository.js";
import { log } from "./log-stream.js";
import { getSummaryByArticleId } from "./summary-repository.js";

// ── Config ──

const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || "aijourney-kb";

/** Maximum records to upsert in a single Pinecone batch call */
const UPSERT_BATCH_SIZE = 96;

/** Pinecone integrated embedding model */
const INTEGRATED_MODEL = "multilingual-e5-large";

/** Dimension for multilingual-e5-large (set by Pinecone, 1024d) */
const INTEGRATED_DIMENSION = 1024;

// Resolve chunker binary relative to this source file
const __dirname = dirname(fileURLToPath(import.meta.url));
const CHUNKER_BIN =
	process.env.CHUNKER_BIN ||
	resolve(__dirname, "../../..", "tools/chunker/target/release/chunker");

// ── Types ──

interface ChunkInput {
	id: string;
	text: string;
	chunk_size: number;
	overlap: number;
}

interface ChunkOutput {
	doc_id: string;
	index: number;
	text: string;
	start: number;
	end: number;
}

export interface RagIngestionResult {
	ingested: number;
	skipped: number;
	totalChunks: number;
	totalTokensUsed: number;
	errors: string[];
}

// ── Pinecone client ──

let pineconeClient: Pinecone | null = null;

function getPinecone(): Pinecone {
	if (!pineconeClient) {
		const apiKey = process.env.PINECONE_API_KEY || "";
		if (!apiKey) throw new Error("PINECONE_API_KEY is not set");
		pineconeClient = new Pinecone({ apiKey });
	}
	return pineconeClient;
}

function getIndex() {
	return getPinecone().index(PINECONE_INDEX_NAME);
}

/** Ensure the Pinecone index is reachable — logs stats. */
export async function ensureCollection(): Promise<void> {
	try {
		const pc = getPinecone();
		const description = await pc.describeIndex(PINECONE_INDEX_NAME);
		log(
			"debug",
			`Pinecone index '${PINECONE_INDEX_NAME}' status: ${description.status?.state}`,
			{
				dimension: description.dimension,
				metric: description.metric,
			},
		);
	} catch (err) {
		throw new Error(
			`Pinecone index '${PINECONE_INDEX_NAME}' not reachable: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * Recreate the Pinecone index with integrated multilingual-e5-large embedding.
 * DESTRUCTIVE — deletes all existing vectors. Re-ingestion required afterwards.
 */
export async function recreateIndex(): Promise<{ message: string }> {
	const pc = getPinecone();

	// Delete existing index if it exists
	try {
		const existing = await pc.describeIndex(PINECONE_INDEX_NAME);
		if (existing) {
			log("info", `Deleting existing Pinecone index '${PINECONE_INDEX_NAME}'`);
			try {
				await pc.configureIndex({
					name: PINECONE_INDEX_NAME,
					deletionProtection: "disabled",
				});
			} catch { /* may already be disabled */ }
			await pc.deleteIndex(PINECONE_INDEX_NAME);
			// Wait for deletion to complete
			await new Promise((r) => setTimeout(r, 5000));
		}
	} catch {
		log("debug", "No existing index to delete");
	}

	// Create new index with integrated embedding
	log("info", `Creating Pinecone index '${PINECONE_INDEX_NAME}' with integrated ${INTEGRATED_MODEL} embedding`);
	await pc.createIndexForModel({
		name: PINECONE_INDEX_NAME,
		cloud: "aws",
		region: "us-east-1",
		embed: {
			model: INTEGRATED_MODEL,
			fieldMap: { text: "text" },
		},
		waitUntilReady: true,
	});

	log("info", `Pinecone index '${PINECONE_INDEX_NAME}' created with integrated ${INTEGRATED_MODEL}`);

	// Reset pinecone client so it picks up new index
	pineconeClient = null;

	return { message: `Index '${PINECONE_INDEX_NAME}' recreated with integrated ${INTEGRATED_MODEL} embedding. Re-ingestion required.` };
}

// ── Chunker (Rust binary via spawn) ──

/** Run the Rust chunker on a batch of documents via stdin/stdout. */
export async function chunkDocuments(
	inputs: ChunkInput[],
): Promise<ChunkOutput[]> {
	const inputJson = JSON.stringify(inputs);
	return new Promise((resolve, reject) => {
		const child: ChildProcess = spawn(CHUNKER_BIN, [], {
			stdio: ["pipe", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		child.stdout!.on("data", (data: Buffer) => {
			stdout += data.toString();
		});

		child.stderr!.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		child.on("error", (err: Error) => {
			reject(new Error(`Chunker spawn error: ${err.message}`));
		});

		child.on("close", (code: number | null) => {
			if (stderr) {
				log("warn", `Chunker stderr: ${stderr.slice(0, 200)}`);
			}
			if (code !== 0) {
				reject(
					new Error(
						`Chunker exited with code ${code}: ${stderr.slice(0, 500)}`,
					),
				);
				return;
			}
			try {
				const parsed = JSON.parse(stdout) as ChunkOutput[];
				resolve(parsed);
			} catch (err) {
				reject(
					new Error(
						`Chunker output parse error: ${err instanceof Error ? err.message : String(err)}`,
					),
				);
			}
		});

		child.stdin!.write(inputJson);
		child.stdin!.end();
	});
}

// ── Document formatting ──

/** Format a summary + article into a text document suitable for chunking. */
function formatDocumentText(article: Article, summary: Summary): string {
	const sc = summary.content;
	const sections = [
		`# ${sc.title}`,
		"",
		`Source: ${article.url}`,
		`Difficulty: ${sc.difficulty}`,
		`Tags: ${sc.tags.join(", ")}`,
		"",
		"## Key Points",
		...sc.keyPoints.map((p) => `- ${p}`),
		"",
		"## Best Practices",
		...sc.dos.map((d) => `- ${d}`),
		"",
		"## Anti-Patterns",
		...sc.donts.map((d) => `- ${d}`),
	];

	if (sc.roleRelevance.length > 0) {
		sections.push("", "## Role Relevance");
		for (const r of sc.roleRelevance) {
			sections.push(`- ${r.role}: ${Math.round(r.relevanceScore * 100)}%`);
		}
	}

	if (sc.citations.length > 0) {
		sections.push("", "## Citations");
		for (const c of sc.citations) {
			sections.push(`> "${c.text}" — ${c.sourceSection}`);
		}
	}

	return sections.join("\n");
}

// ── Main ingestion function ──

/**
 * Run RAG ingestion for all articles with "summarized" or "ingested" status.
 * Chunks via Rust → upserts into Pinecone (Pinecone handles embedding server-side).
 */
export async function runRagIngestion(): Promise<RagIngestionResult> {
	const summarizedArticles = await getArticlesByStatus("summarized");
	const ingestedArticles = await getArticlesByStatus("ingested");
	const articles = [...summarizedArticles, ...ingestedArticles];
	const result: RagIngestionResult = {
		ingested: 0,
		skipped: 0,
		totalChunks: 0,
		totalTokensUsed: 0,
		errors: [],
	};

	log(
		"info",
		`RAG ingestion: processing ${articles.length} summarized articles`,
		{
			count: articles.length,
			pineconeIndex: PINECONE_INDEX_NAME,
		},
	);

	if (articles.length === 0) {
		log("info", "RAG ingestion: no summarized articles to process");
		return result;
	}

	// Ensure index is reachable
	await ensureCollection();

	// Step 1: Prepare documents for chunking
	const chunkInputs: ChunkInput[] = [];
	const articleSummaryMap = new Map<
		string,
		{ article: Article; summary: Summary }
	>();

	for (const article of articles) {
		const summary = await getSummaryByArticleId(article.id);
		if (!summary) {
			result.errors.push(`No summary found for article ${article.id}`);
			log("warn", `RAG skip: no summary for ${article.title.slice(0, 60)}`, {
				articleId: article.id,
			});
			continue;
		}

		const text = formatDocumentText(article, summary);
		chunkInputs.push({
			id: article.id,
			text,
			chunk_size: 800,
			overlap: 150,
		});
		articleSummaryMap.set(article.id, { article, summary });
	}

	if (chunkInputs.length === 0) {
		log("warn", "RAG ingestion: no documents to chunk");
		return result;
	}

	// Step 2: Chunk all documents via Rust binary
	log("info", `Chunking ${chunkInputs.length} documents via Rust chunker`);
	let chunks: ChunkOutput[];
	try {
		chunks = await chunkDocuments(chunkInputs);
	} catch (err) {
		const msg = `Chunker failed: ${err instanceof Error ? err.message : String(err)}`;
		result.errors.push(msg);
		log("error", msg);
		return result;
	}

	log("info", `Chunked into ${chunks.length} chunks`, {
		documents: chunkInputs.length,
		chunks: chunks.length,
	});

	// Step 3: Upsert into Pinecone — embedding is handled server-side by Pinecone
	log("info", `Upserting ${chunks.length} records into Pinecone (integrated ${INTEGRATED_MODEL} embedding)`);
	const index = getIndex();

	const records = chunks.map((chunk) => {
		const pair = articleSummaryMap.get(chunk.doc_id);
		const article = pair?.article;
		const summary = pair?.summary;

		return {
			_id: `${chunk.doc_id}:${chunk.index}`,
			text: chunk.text,
			doc_id: chunk.doc_id,
			chunk_index: chunk.index,
			char_start: chunk.start,
			char_end: chunk.end,
			article_url: article?.url || "",
			article_title: article?.title || "",
			article_source: article?.source || "",
			summary_title: summary?.content.title || "",
			tags: (summary?.content.tags || []).join(", "),
			difficulty: summary?.content.difficulty || "",
			summary_id: summary?.id || "",
		};
	});

	// Upsert in batches (Pinecone embeds each record's text field server-side)
	for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
		const batch = records.slice(i, i + UPSERT_BATCH_SIZE);
		try {
			await index.upsertRecords({ records: batch });
		} catch (err) {
			const msg = `Pinecone upsertRecords failed (batch ${Math.floor(i / UPSERT_BATCH_SIZE)}): ${err instanceof Error ? err.message : String(err)}`;
			result.errors.push(msg);
			log("error", msg);
		}
	}

	result.totalChunks = chunks.length;
	result.totalTokensUsed = 0;

	// Step 4: Update article statuses
	const ingestedDocIds = new Set(chunks.map((c) => c.doc_id));
	for (const docId of ingestedDocIds) {
		try {
			await updateArticleStatus(docId, "ingested");
			result.ingested++;
		} catch (err) {
			result.errors.push(
				`Status update failed for ${docId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	log(
		"info",
		`RAG ingestion complete: ${result.ingested} articles → ${result.totalChunks} chunks, ${result.errors.length} errors`,
		{
			ingested: result.ingested,
			chunks: result.totalChunks,
			errors: result.errors.length,
		},
	);

	return result;
}

// ── Utilities ──

/**
 * Delete all Pinecone vectors associated with a given article (doc_id).
 * Uses searchRecords with metadata filter then deletes matching IDs.
 */
export async function deleteVectorsByArticleId(
	articleId: string,
): Promise<number> {
	try {
		const index = getIndex();
		// Search for records with this doc_id using integrated embedding
		const results = await index.searchRecords({
			query: {
				topK: 1000,
				inputs: { text: "." },
				filter: { doc_id: { $eq: articleId } },
			},
			fields: ["_id"],
		});

		const hits = results.result?.hits ?? [];
		if (hits.length === 0) {
			log("debug", `No Pinecone records found for article ${articleId}`);
			return 0;
		}

		const ids = hits.map((h) => h._id);
		await index.deleteMany(ids);

		log(
			"info",
			`Deleted ${ids.length} Pinecone records for article ${articleId}`,
		);
		return ids.length;
	} catch (err) {
		log(
			"warn",
			`Failed to delete Pinecone records for ${articleId}: ${err instanceof Error ? err.message : String(err)}`,
		);
		return 0;
	}
}

/**
 * Delete all records in the Pinecone index namespace. USE WITH CAUTION.
 */
export async function deleteAllVectors(): Promise<void> {
	try {
		const index = getIndex();
		await index.namespace("").deleteAll();
		log(
			"info",
			`Deleted all records in Pinecone index '${PINECONE_INDEX_NAME}'`,
		);
	} catch (err) {
		log(
			"warn",
			`Failed to delete all Pinecone records: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

// ── Stats ──

export interface VectorDbStats {
	index: {
		name: string;
		dimension: number;
		metric: string;
		state: string;
		totalRecordCount: number;
		indexFullness: number;
		namespaces: Record<string, { recordCount: number }>;
	};
	articles: {
		total: number;
		byStatus: Record<string, number>;
	};
	embedding: {
		model: string;
		dimension: number;
		provider: string;
	};
}

/**
 * Get comprehensive stats about the Pinecone vector database,
 * article pipeline status, and embedding configuration.
 */
export async function getVectorDbStats(): Promise<VectorDbStats> {
	const pc = getPinecone();
	const index = getIndex();

	// Fetch Pinecone index description + stats in parallel
	const [description, indexStats] = await Promise.all([
		pc.describeIndex(PINECONE_INDEX_NAME),
		index.describeIndexStats(),
	]);

	// Fetch article counts by status
	const statuses = [
		"fetched",
		"extracted",
		"deduped",
		"quality_passed",
		"quality_failed",
		"summarized",
		"ingested",
		"rejected",
	] as const;
	const articleCounts = await Promise.all(
		statuses.map(async (status) => {
			const articles = await getArticlesByStatus(status);
			return [status, articles.length] as const;
		}),
	);
	const byStatus: Record<string, number> = {};
	let total = 0;
	for (const [status, count] of articleCounts) {
		byStatus[status] = count;
		total += count;
	}

	return {
		index: {
			name: PINECONE_INDEX_NAME,
			dimension: description.dimension ?? 0,
			metric: description.metric ?? "unknown",
			state: description.status?.state ?? "unknown",
			totalRecordCount: indexStats.totalRecordCount ?? 0,
			indexFullness: indexStats.indexFullness ?? 0,
			namespaces:
				(indexStats.namespaces as Record<string, { recordCount: number }>) ??
				{},
		},
		articles: { total, byStatus },
		embedding: {
			model: INTEGRATED_MODEL,
			dimension: INTEGRATED_DIMENSION,
			provider: "pinecone",
		},
	};
}
