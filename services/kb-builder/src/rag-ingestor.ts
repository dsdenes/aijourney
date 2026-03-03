/**
 * RAG ingestor — uses Pinecone with integrated embedding:
 *   1. TypeScript paragraph-aware text chunker (no external binary needed)
 *   2. Pinecone serverless index with multilingual-e5-large for embedding + vector storage
 *
 * Each "summarized" article gets its formatted summary text chunked
 * and upserted into Pinecone with rich metadata.
 * Pinecone handles both embedding and vector storage internally.
 */

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

/** Maximum records to upsert in a single Pinecone batch call (Pinecone limit: 96 for integrated embedding) */
const UPSERT_BATCH_SIZE = 96;

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

// ── Chunker (pure TypeScript, paragraph-aware) ──

/**
 * Split text into (offset, paragraphText) pairs.
 * A paragraph boundary is two or more consecutive newlines.
 * Single newlines are converted to spaces within a paragraph.
 */
function splitParagraphs(text: string): Array<{ offset: number; text: string }> {
	const paragraphs: Array<{ offset: number; text: string }> = [];
	let currentStart: number | null = null;
	let current = "";
	let consecutiveNewlines = 0;
	let charOffset = 0;

	for (const ch of text) {
		if (ch === "\n") {
			consecutiveNewlines++;
		} else {
			if (consecutiveNewlines >= 2) {
				// Paragraph break
				const trimmed = current.trim();
				if (trimmed) {
					paragraphs.push({ offset: currentStart ?? 0, text: trimmed });
				}
				current = "";
				currentStart = charOffset;
				consecutiveNewlines = 0;
			} else if (consecutiveNewlines === 1) {
				// Single newline → space
				current += " ";
				consecutiveNewlines = 0;
			}
			if (currentStart === null) {
				currentStart = charOffset;
			}
			current += ch;
		}
		charOffset += Buffer.byteLength(ch, "utf8");
	}

	// Flush last paragraph
	const trimmed = current.trim();
	if (trimmed) {
		paragraphs.push({ offset: currentStart ?? 0, text: trimmed });
	}

	return paragraphs;
}

/**
 * Paragraph-aware, overlapping text chunker.
 * Greedily accumulates paragraphs up to `chunk_size` chars,
 * then backs up by `overlap` chars worth of paragraphs for context continuity.
 */
function chunkText(input: ChunkInput): ChunkOutput[] {
	const paragraphs = splitParagraphs(input.text);
	if (paragraphs.length === 0) return [];

	const chunks: ChunkOutput[] = [];
	let i = 0;

	while (i < paragraphs.length) {
		let currentText = "";
		const chunkStart = paragraphs[i]!.offset;
		let chunkEnd = paragraphs[i]!.offset;
		let j = i;

		// Accumulate paragraphs up to chunk_size
		while (j < paragraphs.length) {
			const para = paragraphs[j]!.text;
			const wouldBe = currentText === "" ? para.length : currentText.length + 2 + para.length;

			if (currentText !== "" && wouldBe > input.chunk_size) {
				break;
			}

			if (currentText !== "") {
				currentText += "\n\n";
			}
			currentText += para;
			chunkEnd = paragraphs[j]!.offset + paragraphs[j]!.text.length;
			j++;
		}

		chunks.push({
			doc_id: input.id,
			index: chunks.length,
			text: currentText,
			start: chunkStart,
			end: chunkEnd,
		});

		if (j >= paragraphs.length) break;

		// Calculate overlap: back up enough paragraphs to cover `overlap` chars
		let overlapChars = 0;
		let back = j;
		while (back > i + 1 && overlapChars < input.overlap) {
			back--;
			overlapChars += paragraphs[back]!.text.length;
		}

		i = back;
	}

	return chunks;
}

/** Chunk a batch of documents using paragraph-aware splitting. */
export function chunkDocuments(inputs: ChunkInput[]): ChunkOutput[] {
	const allChunks: ChunkOutput[] = [];
	for (const input of inputs) {
		allChunks.push(...chunkText(input));
	}
	return allChunks;
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
 * Chunks → upserts into Pinecone (which embeds internally via multilingual-e5-large).
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

	// Step 2: Chunk all documents via TypeScript paragraph-aware chunker
	log("info", `Chunking ${chunkInputs.length} documents`);
	let chunks: ChunkOutput[];
	try {
		chunks = chunkDocuments(chunkInputs);
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

	// Step 3: Upsert into Pinecone (embedding handled internally by Pinecone)
	log("info", `Upserting ${chunks.length} records into Pinecone`);
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
			tags: summary?.content.tags || [],
			difficulty: summary?.content.difficulty || "",
			summary_id: summary?.id || "",
		};
	});

	// Upsert in batches
	for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
		const batch = records.slice(i, i + UPSERT_BATCH_SIZE);
		try {
			await index.upsertRecords({ records: batch });
		} catch (err) {
			const msg = `Pinecone upsert failed (batch ${Math.floor(i / UPSERT_BATCH_SIZE)}): ${err instanceof Error ? err.message : String(err)}`;
			result.errors.push(msg);
			log("error", msg);
		}
	}

	result.totalChunks = chunks.length;
	// No external embedding tokens used — Pinecone handles embedding internally
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
 * Delete all Pinecone records associated with a given article (doc_id).
 * Uses Pinecone's deleteMany with a filter on the doc_id metadata field.
 */
export async function deleteVectorsByArticleId(
	articleId: string,
): Promise<number> {
	try {
		const index = getIndex();
		// Pinecone integrated model indexes use `searchRecords` to find, `deleteMany` to remove
		// We delete by listing matching IDs then deleting them
		const results = await index.searchRecords({
			query: {
				topK: 1000,
				filter: { doc_id: { $eq: articleId } },
				inputs: { text: "." },
			},
			fields: [],
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
