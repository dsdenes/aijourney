/**
 * RAG query module — embeds query via OpenAI text-embedding-3-small,
 * then retrieves relevant chunks from Pinecone using standard vector search.
 *
 * Used by the chat service via the kb-builder HTTP API.
 */

import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import { log } from "./log-stream.js";

// ── Config ──

const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || "aijourney-kb";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSION = 1536;

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

// ── OpenAI client ──

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
	if (!openaiClient) {
		const apiKey = process.env.OPENAI_API_KEY || "";
		if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
		openaiClient = new OpenAI({ apiKey });
	}
	return openaiClient;
}

/** Embed a single text for query purposes. */
async function embedQuery(text: string): Promise<number[]> {
	const openai = getOpenAI();
	const response = await openai.embeddings.create({
		model: EMBEDDING_MODEL,
		input: text,
		dimensions: EMBEDDING_DIMENSION,
	});
	return response.data[0]!.embedding;
}

// ── Search ──

/**
 * Search the Pinecone knowledge base for chunks relevant to a query.
 * Embeds via OpenAI text-embedding-3-small, then queries Pinecone.
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

	// Embed the query text via OpenAI
	const queryVector = await embedQuery(query);

	// Standard Pinecone vector query
	const response = await index.query({
		vector: queryVector,
		topK,
		includeMetadata: true,
	});

	const matches = response.matches ?? [];

	// Filter by score threshold and map results
	const chunks: RagChunk[] = matches
		.filter((match) => (match.score ?? 0) >= scoreThreshold)
		.map((match) => {
			const m = (match.metadata ?? {}) as Record<string, unknown>;
			return {
				text: String(m.text || ""),
				score: match.score ?? 0,
				metadata: {
					doc_id: String(m.doc_id || ""),
					chunk_index: Number(m.chunk_index || 0),
					article_url: String(m.article_url || ""),
					article_title: String(m.article_title || ""),
					article_source: String(m.article_source || ""),
					summary_title: String(m.summary_title || ""),
					tags: (m.tags as string[]) || [],
					difficulty: String(m.difficulty || ""),
				},
			};
		});

	log(
		"debug",
		`RAG search: "${query.slice(0, 60)}" → ${chunks.length} chunks`,
		{
			topK,
			scoreThreshold,
			resultsFound: chunks.length,
		},
	);

	return { chunks, tokensUsed: 0 };
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
