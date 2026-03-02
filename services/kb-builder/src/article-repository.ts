import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
	DynamoDBDocumentClient,
	PutCommand,
	ScanCommand,
	QueryCommand,
	GetCommand,
	UpdateCommand,
	DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { generateId, nowISO } from "@aijourney/shared";
import type { Article, ArticleStatus } from "@aijourney/shared";
import { createHash } from "node:crypto";

const client = new DynamoDBClient({
	region: process.env.AWS_REGION || "eu-central-1",
	...(process.env.DYNAMODB_ENDPOINT && {
		endpoint: process.env.DYNAMODB_ENDPOINT,
	}),
});

const ddb = DynamoDBDocumentClient.from(client, {
	marshallOptions: { removeUndefinedValues: true },
});
const TABLE = "articles";

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
	await ddb.send(
		new PutCommand({
			TableName: TABLE,
			// Include crawledAt as alias of fetchedAt for the status-crawledAt GSI
			Item: { ...item, crawledAt: item.fetchedAt },
		}),
	);
	return item;
}

export async function getArticleByUrl(url: string): Promise<Article | null> {
	// For MVP: scan with filter. In production, add a GSI on url.
	const result = await ddb.send(
		new ScanCommand({
			TableName: TABLE,
			FilterExpression: "#u = :url",
			ExpressionAttributeNames: { "#u": "url" },
			ExpressionAttributeValues: { ":url": url },
			Limit: 1,
		}),
	);
	const items = result.Items as Article[] | undefined;
	return items?.[0] ?? null;
}

export async function getAllArticles(): Promise<Article[]> {
	const items: Article[] = [];
	let lastKey: Record<string, unknown> | undefined;

	do {
		const result = await ddb.send(
			new ScanCommand({
				TableName: TABLE,
				ExclusiveStartKey: lastKey,
			}),
		);
		if (result.Items) {
			items.push(...(result.Items as Article[]));
		}
		lastKey = result.LastEvaluatedKey;
	} while (lastKey);

	// Sort newest first
	return items.sort(
		(a, b) =>
			new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);
}

export async function getArticlesByStatus(
	status: ArticleStatus,
): Promise<Article[]> {
	const result = await ddb.send(
		new QueryCommand({
			TableName: TABLE,
			IndexName: "status-crawledAt-index",
			KeyConditionExpression: "#s = :status",
			ExpressionAttributeNames: { "#s": "status" },
			ExpressionAttributeValues: { ":status": status },
		}),
	);
	return (result.Items as Article[] | undefined) ?? [];
}

export async function getArticleById(id: string): Promise<Article | null> {
	const result = await ddb.send(
		new GetCommand({
			TableName: TABLE,
			Key: { id },
		}),
	);
	return (result.Item as Article | undefined) ?? null;
}

export async function countArticles(): Promise<number> {
	const result = await ddb.send(
		new ScanCommand({
			TableName: TABLE,
			Select: "COUNT",
		}),
	);
	return result.Count ?? 0;
}

export async function updateArticleStatus(
	id: string,
	status: ArticleStatus,
	extra?: Partial<Pick<Article, "qualityScore" | "ingestionRunId">>,
): Promise<void> {
	const now = nowISO();
	let updateExpr = "SET #s = :status, #u = :now";
	const names: Record<string, string> = { "#s": "status", "#u": "updatedAt" };
	const values: Record<string, unknown> = { ":status": status, ":now": now };

	if (extra?.qualityScore !== undefined) {
		updateExpr += ", #qs = :qs";
		names["#qs"] = "qualityScore";
		values[":qs"] = extra.qualityScore;
	}
	if (extra?.ingestionRunId !== undefined) {
		updateExpr += ", #ir = :ir";
		names["#ir"] = "ingestionRunId";
		values[":ir"] = extra.ingestionRunId;
	}

	await ddb.send(
		new UpdateCommand({
			TableName: TABLE,
			Key: { id },
			UpdateExpression: updateExpr,
			ExpressionAttributeNames: names,
			ExpressionAttributeValues: values,
		}),
	);
}

/**
 * Backfill `crawledAt` for articles that don't have it.
 * This is needed because the status-crawledAt GSI requires crawledAt to index articles.
 * Uses fetchedAt as the value.
 */
export async function backfillCrawledAt(): Promise<number> {
	const all = await getAllArticles();
	let updated = 0;
	for (const article of all) {
		// Check if crawledAt is missing (it's not in the Article type, so cast)
		const raw = article as Article & { crawledAt?: string };
		if (!raw.crawledAt) {
			await ddb.send(
				new UpdateCommand({
					TableName: TABLE,
					Key: { id: article.id },
					UpdateExpression: "SET crawledAt = :ca",
					ExpressionAttributeValues: { ":ca": article.fetchedAt },
				}),
			);
			updated++;
		}
	}
	return updated;
}

export async function deleteArticle(id: string): Promise<boolean> {
	const existing = await getArticleById(id);
	if (!existing) return false;
	await ddb.send(
		new DeleteCommand({
			TableName: TABLE,
			Key: { id },
		}),
	);
	return true;
}
