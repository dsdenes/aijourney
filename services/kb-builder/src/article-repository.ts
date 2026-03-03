import { createHash } from "node:crypto";
import type { Article, ArticleStatus } from "@aijourney/shared";
import { generateId, nowISO } from "@aijourney/shared";
import { getDb } from "./db.js";

interface ArticleDoc {
	_id: string;
	[key: string]: unknown;
}

function toDoc(article: Article): ArticleDoc {
	const { id, ...rest } = article;
	return { _id: id, ...rest } as ArticleDoc;
}

function fromDoc(doc: ArticleDoc): Article {
	const { _id, ...rest } = doc;
	return { id: _id, ...rest } as Article;
}

function col() {
	return getDb().collection<ArticleDoc>("articles");
}

export function hashContent(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

export async function saveArticle(
	article: Omit<Article, "id" | "createdAt" | "updatedAt">,
): Promise<Article> {
	const now = nowISO();
	const item: Article = {
		...article,
		id: generateId(),
		createdAt: now,
		updatedAt: now,
	};
	await col().insertOne(toDoc(item));
	return item;
}

export async function getArticleByUrl(url: string): Promise<Article | null> {
	const doc = await col().findOne({ url });
	return doc ? fromDoc(doc) : null;
}

export async function getAllArticles(): Promise<Article[]> {
	const docs = await col().find({}).sort({ createdAt: -1 }).toArray();
	return docs.map((d) => fromDoc(d));
}

export async function getArticlesByStatus(
	status: ArticleStatus,
): Promise<Article[]> {
	const docs = await col().find({ status }).sort({ fetchedAt: -1 }).toArray();
	return docs.map((d) => fromDoc(d));
}

export async function getArticleById(id: string): Promise<Article | null> {
	const doc = await col().findOne({ _id: id });
	return doc ? fromDoc(doc) : null;
}

export async function countArticles(): Promise<number> {
	return col().countDocuments({});
}

export async function updateArticleStatus(
	id: string,
	status: ArticleStatus,
	extra?: Partial<Pick<Article, "qualityScore" | "ingestionRunId">>,
): Promise<void> {
	const now = nowISO();
	const updates: Record<string, unknown> = {
		status,
		updatedAt: now,
	};
	if (extra?.qualityScore !== undefined) {
		updates.qualityScore = extra.qualityScore;
	}
	if (extra?.ingestionRunId !== undefined) {
		updates.ingestionRunId = extra.ingestionRunId;
	}
	await col().updateOne({ _id: id }, { $set: updates });
}

export async function backfillCrawledAt(): Promise<number> {
	// No longer needed — MongoDB doesn't require crawledAt for indexing
	// Kept for API compatibility; returns 0
	return 0;
}

export async function deleteArticle(id: string): Promise<boolean> {
	const result = await col().deleteOne({ _id: id });
	return result.deletedCount > 0;
}
