import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Summary, Article } from "@aijourney/shared";
import { getArticlesByStatus, updateArticleStatus } from "./article-repository.js";
import { getAllSummaries, getSummaryByArticleId } from "./summary-repository.js";
import { log } from "./log-stream.js";

const S3_BUCKET = process.env.KB_S3_BUCKET || "aijourney-kb-data";
const S3_PREFIX = process.env.KB_S3_PREFIX || "kb-documents/";
const AWS_REGION = process.env.AWS_REGION || "eu-central-1";

const s3 = new S3Client({
	region: AWS_REGION,
	...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT }),
});

export interface IngestionResult {
	ingested: number;
	skipped: number;
	errors: string[];
}

/**
 * Format a summary + article into a Bedrock KB-compatible document.
 * Bedrock Knowledge Bases read from S3; each document is a text file
 * with metadata in a companion .metadata.json file.
 */
function formatBedrockDocument(article: Article, summary: Summary): {
	content: string;
	metadata: Record<string, unknown>;
} {
	const sc = summary.content;
	const sections = [
		`# ${sc.title}`,
		"",
		`**Source**: ${article.url}`,
		`**Difficulty**: ${sc.difficulty}`,
		`**Tags**: ${sc.tags.join(", ")}`,
		"",
		"## Key Points",
		...sc.keyPoints.map((p) => `- ${p}`),
		"",
		"## Best Practices (Do's)",
		...sc.dos.map((d) => `- ✅ ${d}`),
		"",
		"## Anti-Patterns (Don'ts)",
		...sc.donts.map((d) => `- ❌ ${d}`),
		"",
		"## Role Relevance",
		...sc.roleRelevance.map(
			(r) => `- **${r.role}**: ${Math.round(r.relevanceScore * 100)}%`,
		),
	];

	if (sc.citations.length > 0) {
		sections.push("", "## Citations");
		for (const c of sc.citations) {
			sections.push(`> "${c.text}" — ${c.sourceSection}`);
		}
	}

	const metadata = {
		sourceUrl: article.url,
		title: sc.title,
		tags: sc.tags,
		difficulty: sc.difficulty,
		source: article.source,
		articleId: article.id,
		summaryId: summary.id,
		roles: Object.fromEntries(
			sc.roleRelevance.map((r) => [r.role, r.relevanceScore]),
		),
		crawledAt: article.fetchedAt,
		summarizedAt: summary.createdAt,
	};

	return { content: sections.join("\n"), metadata };
}

/**
 * Upload a document + metadata to S3 for Bedrock KB ingestion.
 */
async function uploadToS3(
	key: string,
	content: string,
	metadata: Record<string, unknown>,
): Promise<void> {
	// Upload the document content
	await s3.send(
		new PutObjectCommand({
			Bucket: S3_BUCKET,
			Key: `${S3_PREFIX}${key}.txt`,
			Body: content,
			ContentType: "text/plain; charset=utf-8",
		}),
	);

	// Upload companion metadata file (Bedrock KB uses this for filtering)
	await s3.send(
		new PutObjectCommand({
			Bucket: S3_BUCKET,
			Key: `${S3_PREFIX}${key}.metadata.json`,
			Body: JSON.stringify(metadata, null, 2),
			ContentType: "application/json",
		}),
	);
}

/**
 * Run ingestion for all summarized articles.
 * Uploads formatted documents to S3 and updates article status to "ingested".
 *
 * Note: In production, this would also trigger a Bedrock KB sync job.
 * For MVP, we upload to S3 and mark as ingested. The Bedrock KB can be
 * configured to read from this S3 prefix once it's created via Terraform.
 */
export async function runIngestion(): Promise<IngestionResult> {
	const articles = await getArticlesByStatus("summarized");
	const result: IngestionResult = { ingested: 0, skipped: 0, errors: [] };

	log("info", `Bedrock ingestion: processing ${articles.length} summarized articles`, {
		count: articles.length,
		bucket: S3_BUCKET,
		prefix: S3_PREFIX,
	});

	if (articles.length === 0) {
		log("info", "Ingestion: no summarized articles to process");
		return result;
	}

	for (const article of articles) {
		try {
			// Get the summary for this article
			const summary = await getSummaryByArticleId(article.id);
			if (!summary) {
				result.errors.push(`No summary found for article ${article.id}`);
				log("warn", `Ingestion skip: no summary for ${article.title.slice(0, 60)}`, {
					articleId: article.id,
				});
				continue;
			}

			// Format the document
			const { content, metadata } = formatBedrockDocument(article, summary);

			// Upload to S3
			const docKey = `${article.source.toLowerCase().replace(/\s+/g, "-")}/${article.id}`;
			await uploadToS3(docKey, content, metadata);

			// Update article status
			await updateArticleStatus(article.id, "ingested");
			result.ingested++;

			log("info", `Ingested: ${article.title.slice(0, 60)}`, {
				articleId: article.id,
				summaryId: summary.id,
				s3Key: `${S3_PREFIX}${docKey}.txt`,
			});
		} catch (err) {
			const msg = `Ingestion failed for ${article.id}: ${err instanceof Error ? err.message : String(err)}`;
			result.errors.push(msg);
			log("error", msg, { articleId: article.id });
		}
	}

	log("info", `Ingestion complete: ${result.ingested} ingested, ${result.skipped} skipped, ${result.errors.length} errors`, {
		ingested: result.ingested,
		skipped: result.skipped,
		errors: result.errors.length,
	});

	// TODO (Production): Trigger Bedrock KB sync
	// await triggerBedrockKBSync(knowledgeBaseId, dataSourceId);

	return result;
}
