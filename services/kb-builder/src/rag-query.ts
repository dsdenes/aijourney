/**
 * RAG query module — retrieves relevant chunks from Qdrant using
 * OpenAI embeddings for semantic search.
 *
 * Used by the chat service when RAG_PROVIDER=self (default).
 */

import OpenAI from "openai";
import { getRateLimiter } from "@aijourney/shared";
import { log } from "./log-stream.js";

// ── Config ──

const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || "kb_chunks";
const EMBEDDING_MODEL = "text-embedding-3-small";

/** Rate limiter shared with rag-ingestor for the same model */
const embeddingRateLimiter = getRateLimiter(EMBEDDING_MODEL, {
	logger: (msg) => log("warn", msg),
});

// ── Types ──

export interface RagChunk {
	text: string;
	score: number;
	metadata: {
		doc_id: string;
		chunk_index: number;
		article_url: string;
		article_title: string;
		article_source: string;
		summary_title: string;
		tags: string[];
		difficulty: string;
	};
}

export interface RagSearchResult {
	chunks: RagChunk[];
	tokensUsed: number;
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

// ── Qdrant query ──

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

/**
 * Search the Qdrant knowledge base for chunks relevant to a query.
 *
 * @param query - User's search query / chat message
 * @param topK - Number of top chunks to retrieve (default: 8)
 * @param scoreThreshold - Minimum similarity score (0-1, default: 0.3)
 */
export async function searchKnowledgeBase(
	query: string,
	topK = 8,
	scoreThreshold = 0.3,
): Promise<RagSearchResult> {
	const openai = getOpenAI();

	// Step 1: Embed the query (with rate limiting)
	const estimatedTokens = Math.ceil(query.length / 4);
	await embeddingRateLimiter.waitForCapacity(estimatedTokens);
	embeddingRateLimiter.recordRequest(estimatedTokens);

	const embResponse = await openai.embeddings.create({
		model: EMBEDDING_MODEL,
		input: query,
	});

	const queryVector = embResponse.data[0]?.embedding;
	if (!queryVector) {
		throw new Error("Failed to generate embedding for query");
	}

	const tokensUsed = embResponse.usage?.total_tokens ?? 0;
	if (tokensUsed > 0) {
		embeddingRateLimiter.recordUsage(Math.max(0, tokensUsed - estimatedTokens));
	}

	// Step 2: Search Qdrant
	const searchResult = (await qdrantRequest(
		`/collections/${QDRANT_COLLECTION}/points/search`,
		"POST",
		{
			vector: queryVector,
			limit: topK,
			score_threshold: scoreThreshold,
			with_payload: true,
		},
	)) as { result: QdrantSearchHit[] };

	// Step 3: Map results
	const chunks: RagChunk[] = (searchResult.result || []).map((hit) => ({
		text: String(hit.payload?.text || ""),
		score: hit.score,
		metadata: {
			doc_id: String(hit.payload?.doc_id || ""),
			chunk_index: Number(hit.payload?.chunk_index || 0),
			article_url: String(hit.payload?.article_url || ""),
			article_title: String(hit.payload?.article_title || ""),
			article_source: String(hit.payload?.article_source || ""),
			summary_title: String(hit.payload?.summary_title || ""),
			tags: (hit.payload?.tags as string[]) || [],
			difficulty: String(hit.payload?.difficulty || ""),
		},
	}));

	log("debug", `RAG search: "${query.slice(0, 60)}" → ${chunks.length} chunks`, {
		topK,
		scoreThreshold,
		resultsFound: chunks.length,
		tokensUsed,
	});

	return { chunks, tokensUsed };
}

/**
 * Check if the Qdrant collection exists and has vectors.
 */
export async function isRagAvailable(): Promise<boolean> {
	try {
		const info = (await qdrantRequest(
			`/collections/${QDRANT_COLLECTION}`,
		)) as { result?: { points_count?: number } };
		return (info.result?.points_count ?? 0) > 0;
	} catch {
		return false;
	}
}

// ── Internal types ──

interface QdrantSearchHit {
	id: string | number;
	score: number;
	payload?: Record<string, unknown>;
}
