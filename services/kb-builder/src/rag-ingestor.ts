/**
 * Self-hosted RAG ingestor — replaces Bedrock KB with:
 *   1. Rust chunker for paragraph-aware text splitting
 *   2. OpenAI text-embedding-3-small for embeddings
 *   3. Qdrant for vector storage
 *
 * Each "summarized" article gets its formatted summary text chunked,
 * embedded, and upserted into Qdrant with rich metadata.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Article, Summary } from "@aijourney/shared";
import { getRateLimiter } from "@aijourney/shared";
import OpenAI from "openai";
import {
	getArticlesByStatus,
	updateArticleStatus,
} from "./article-repository.js";
import { log } from "./log-stream.js";
import { getSummaryByArticleId } from "./summary-repository.js";

// ── Config ──

const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || "kb_chunks";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

/** Maximum chunks to embed in a single OpenAI batch call */
const EMBEDDING_BATCH_SIZE = 50;

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

// ── OpenAI client ──

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
	if (!openaiClient) {
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
		openaiClient = new OpenAI({ apiKey });
	}
	return openaiClient;
}

// ── Qdrant helpers ──

async function qdrantRequest(
	path: string,
	method: string = "GET",
	body?: unknown,
): Promise<unknown> {
	const res = await fetch(`${QDRANT_URL}${path}`, {
		method,
		headers: { "Content-Type": "application/json" },
		...(body !== undefined && { body: JSON.stringify(body) }),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Qdrant ${method} ${path} failed (${res.status}): ${text}`);
	}
	return res.json();
}

/** Ensure the Qdrant collection exists with the right vector config. */
export async function ensureCollection(): Promise<void> {
	try {
		await qdrantRequest(`/collections/${QDRANT_COLLECTION}`);
		log("debug", `Qdrant collection '${QDRANT_COLLECTION}' already exists`);
	} catch {
		log("info", `Creating Qdrant collection '${QDRANT_COLLECTION}'`);
		await qdrantRequest(`/collections/${QDRANT_COLLECTION}`, "PUT", {
			vectors: {
				size: EMBEDDING_DIMENSIONS,
				distance: "Cosine",
			},
		});
		log("info", `Qdrant collection '${QDRANT_COLLECTION}' created`);
	}
}

// ── Chunker ──

/** Run the Rust chunker on a batch of documents using spawn for proper pipe handling. */
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

		// Write input to stdin and close the pipe
		child.stdin!.write(inputJson);
		child.stdin!.end();
	});
}

// ── Embeddings ──

/** Rate limiter for the embedding model */
const embeddingRateLimiter = getRateLimiter(EMBEDDING_MODEL, {
	logger: (msg) => log("warn", msg),
});

/** Embed an array of texts using OpenAI text-embedding-3-small. */
async function embedTexts(
	texts: string[],
): Promise<{ embeddings: number[][]; tokensUsed: number }> {
	if (texts.length === 0) return { embeddings: [], tokensUsed: 0 };

	const openai = getOpenAI();
	let allEmbeddings: number[][] = [];
	let totalTokens = 0;

	// Process in batches
	for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
		const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);

		// Estimate tokens: ~4 chars per token across all batch texts
		const estimatedTokens = Math.ceil(
			batch.reduce((sum, t) => sum + t.length, 0) / 4,
		);
		await embeddingRateLimiter.waitForCapacity(estimatedTokens);
		embeddingRateLimiter.recordRequest(estimatedTokens);

		const response = await openai.embeddings.create({
			model: EMBEDDING_MODEL,
			input: batch,
		});

		const actualTokens = response.usage?.total_tokens ?? 0;
		if (actualTokens > 0) {
			embeddingRateLimiter.recordUsage(
				Math.max(0, actualTokens - estimatedTokens),
			);
		}

		const batchEmbeddings = response.data
			.sort((a, b) => a.index - b.index)
			.map((d) => d.embedding);

		allEmbeddings = allEmbeddings.concat(batchEmbeddings);
		totalTokens += actualTokens;
	}

	return { embeddings: allEmbeddings, tokensUsed: totalTokens };
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
 * Run self-hosted RAG ingestion for all articles with "summarized" or "ingested" status.
 * (Articles may already be "ingested" via S3/Bedrock but not yet in Qdrant.)
 * Chunks → embeds → upserts into Qdrant → updates status to "ingested".
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
			qdrantUrl: QDRANT_URL,
			collection: QDRANT_COLLECTION,
		},
	);

	if (articles.length === 0) {
		log("info", "RAG ingestion: no summarized articles to process");
		return result;
	}

	// Ensure collection exists
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

	// Step 3: Embed all chunks
	log(
		"info",
		`Embedding ${chunks.length} chunks via OpenAI ${EMBEDDING_MODEL}`,
	);
	const chunkTexts = chunks.map((c) => c.text);
	let embeddings: number[][];
	let embeddingTokens: number;
	try {
		const embResult = await embedTexts(chunkTexts);
		embeddings = embResult.embeddings;
		embeddingTokens = embResult.tokensUsed;
	} catch (err) {
		const msg = `Embedding failed: ${err instanceof Error ? err.message : String(err)}`;
		result.errors.push(msg);
		log("error", msg);
		return result;
	}

	result.totalTokensUsed = embeddingTokens;
	log("info", `Embedded ${chunks.length} chunks (${embeddingTokens} tokens)`, {
		chunks: chunks.length,
		tokensUsed: embeddingTokens,
	});

	// Step 4: Upsert into Qdrant
	log("info", `Upserting ${chunks.length} vectors into Qdrant`);
	const points = chunks.map((chunk, i) => {
		const pair = articleSummaryMap.get(chunk.doc_id);
		const article = pair?.article;
		const summary = pair?.summary;

		return {
			id: hashToUuid(chunk.doc_id, chunk.index),
			vector: embeddings[i],
			payload: {
				doc_id: chunk.doc_id,
				chunk_index: chunk.index,
				text: chunk.text,
				char_start: chunk.start,
				char_end: chunk.end,
				// Article metadata
				article_url: article?.url || "",
				article_title: article?.title || "",
				article_source: article?.source || "",
				// Summary metadata
				summary_title: summary?.content.title || "",
				tags: summary?.content.tags || [],
				difficulty: summary?.content.difficulty || "",
				summary_id: summary?.id || "",
			},
		};
	});

	// Upsert in batches of 100
	const UPSERT_BATCH = 100;
	for (let i = 0; i < points.length; i += UPSERT_BATCH) {
		const batch = points.slice(i, i + UPSERT_BATCH);
		try {
			await qdrantRequest(`/collections/${QDRANT_COLLECTION}/points`, "PUT", {
				points: batch,
			});
		} catch (err) {
			const msg = `Qdrant upsert failed (batch ${Math.floor(i / UPSERT_BATCH)}): ${err instanceof Error ? err.message : String(err)}`;
			result.errors.push(msg);
			log("error", msg);
		}
	}

	result.totalChunks = chunks.length;

	// Step 5: Update article statuses
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
		`RAG ingestion complete: ${result.ingested} articles → ${result.totalChunks} chunks, ${result.totalTokensUsed} embedding tokens, ${result.errors.length} errors`,
		{
			ingested: result.ingested,
			chunks: result.totalChunks,
			tokensUsed: result.totalTokensUsed,
			errors: result.errors.length,
		},
	);

	return result;
}

// ── Utilities ──

/** Generate a deterministic UUID v5-like string from doc_id + chunk index. */
function hashToUuid(docId: string, chunkIndex: number): string {
	// Simple deterministic hash → UUID-like format for Qdrant point IDs
	const str = `${docId}:${chunkIndex}`;
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash + char) | 0;
	}
	// Convert to a UUID-like string (Qdrant accepts UUIDs or u64)
	const hex = Math.abs(hash).toString(16).padStart(8, "0");
	const hex2 = Math.abs(hash * 31)
		.toString(16)
		.padStart(8, "0");
	const hex3 = Math.abs(hash * 997)
		.toString(16)
		.padStart(8, "0");
	const hex4 = Math.abs(hash * 7919)
		.toString(16)
		.padStart(8, "0");
	return `${hex}-${hex2.slice(0, 4)}-4${hex2.slice(5, 8)}-a${hex3.slice(1, 4)}-${hex4.slice(0, 8)}${hex.slice(0, 4)}`;
}

/**
 * Delete all Qdrant vectors associated with a given article (doc_id).
 * Uses Qdrant's points/delete with a filter on the doc_id payload field.
 */
export async function deleteVectorsByArticleId(
	articleId: string,
): Promise<number> {
	try {
		// First, count existing points for this article
		const scrollResult = (await qdrantRequest(
			`/collections/${QDRANT_COLLECTION}/points/scroll`,
			"POST",
			{
				filter: {
					must: [{ key: "doc_id", match: { value: articleId } }],
				},
				limit: 1000,
				with_payload: false,
				with_vector: false,
			},
		)) as { result: { points: Array<{ id: string }> } };

		const count = scrollResult.result?.points?.length ?? 0;

		if (count === 0) {
			log("debug", `No Qdrant vectors found for article ${articleId}`);
			return 0;
		}

		// Delete by filter
		await qdrantRequest(
			`/collections/${QDRANT_COLLECTION}/points/delete`,
			"POST",
			{
				filter: {
					must: [{ key: "doc_id", match: { value: articleId } }],
				},
			},
		);

		log("info", `Deleted ${count} Qdrant vectors for article ${articleId}`);
		return count;
	} catch (err) {
		log(
			"warn",
			`Failed to delete Qdrant vectors for ${articleId}: ${err instanceof Error ? err.message : String(err)}`,
		);
		return 0;
	}
}

/**
 * Delete all vectors in the collection. USE WITH CAUTION.
 */
export async function deleteAllVectors(): Promise<void> {
	try {
		await qdrantRequest(`/collections/${QDRANT_COLLECTION}`, "DELETE");
		log("info", `Deleted Qdrant collection '${QDRANT_COLLECTION}'`);
		// Re-create empty collection
		await ensureCollection();
	} catch (err) {
		log(
			"warn",
			`Failed to delete Qdrant collection: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}
