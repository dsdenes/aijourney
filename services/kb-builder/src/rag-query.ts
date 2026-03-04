/**
 * RAG query module — uses Pinecone integrated multilingual-e5-large embedding
 * for both indexing and querying. No external embedding API calls needed.
 *
 * Used by the chat service via the kb-builder HTTP API.
 */

import { Pinecone } from "@pinecone-database/pinecone";
import { log } from "./log-stream.js";

// ── Config ──

const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || "aijourney-kb";

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
	/** Raw Pinecone response for debugging */
	rawResponse?: unknown;
	/** Time in ms for the Pinecone search */
	searchTimeMs?: number;
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

// ── Search ──

/**
 * Search the Pinecone knowledge base for chunks relevant to a query.
 * Uses Pinecone's integrated multilingual-e5-large embedding — no OpenAI call.
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
	const index = getIndex();

	// Use Pinecone integrated embedding — query with text, not vector
	const searchStart = Date.now();
	const response = await index.searchRecords({
		query: {
			topK,
			inputs: { text: query },
		},
		fields: [
			"text",
			"doc_id",
			"chunk_index",
			"article_url",
			"article_title",
			"article_source",
			"summary_title",
			"tags",
			"difficulty",
		],
	});
	const searchTimeMs = Date.now() - searchStart;

	const hits = response.result?.hits ?? [];

	// Filter by score threshold and map results
	const chunks: RagChunk[] = hits
		.filter((hit) => (hit._score ?? 0) >= scoreThreshold)
		.map((hit) => {
			const f = (hit.fields ?? {}) as Record<string, unknown>;
			// Tags may be stored as comma-separated string (from upsertRecords)
			const rawTags = f.tags;
			const tags: string[] =
				typeof rawTags === "string"
					? rawTags.split(", ").filter(Boolean)
					: Array.isArray(rawTags)
						? (rawTags as string[])
						: [];

			return {
				text: String(f.text || ""),
				score: hit._score ?? 0,
				metadata: {
					doc_id: String(f.doc_id || ""),
					chunk_index: Number(f.chunk_index || 0),
					article_url: String(f.article_url || ""),
					article_title: String(f.article_title || ""),
					article_source: String(f.article_source || ""),
					summary_title: String(f.summary_title || ""),
					tags,
					difficulty: String(f.difficulty || ""),
				},
			};
		});

	log(
		"debug",
		`RAG search: "${query.slice(0, 60)}" → ${chunks.length} chunks (${searchTimeMs}ms)`,
		{
			topK,
			scoreThreshold,
			resultsFound: chunks.length,
			searchTimeMs,
		},
	);

	return {
		chunks,
		tokensUsed: 0,
		rawResponse: { hitCount: hits.length, hits: hits.map((h) => ({ _id: h._id, _score: h._score })) },
		searchTimeMs,
	};
}

/**
 * Check if the Pinecone index has records (i.e. RAG data is available).
 */
export async function isRagAvailable(): Promise<boolean> {
	try {
		const pc = getPinecone();
		const description = await pc.describeIndex(PINECONE_INDEX_NAME);
		return description.status?.state === "Ready";
	} catch {
		return false;
	}
}
