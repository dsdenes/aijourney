import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
	DynamoDBDocumentClient,
	PutCommand,
	QueryCommand,
	GetCommand,
	ScanCommand,
	DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { generateId, nowISO } from "@aijourney/shared";
import type { Summary } from "@aijourney/shared";

const client = new DynamoDBClient({
	region: process.env.AWS_REGION || "eu-central-1",
	...(process.env.DYNAMODB_ENDPOINT && {
		endpoint: process.env.DYNAMODB_ENDPOINT,
	}),
});

const ddb = DynamoDBDocumentClient.from(client, {
	marshallOptions: { removeUndefinedValues: true },
});
const TABLE = "summaries";

export async function saveSummary(
	summary: Omit<Summary, "id" | "createdAt">,
): Promise<Summary> {
	const item: Summary = {
		...summary,
		id: generateId(),
		createdAt: nowISO(),
	};
	await ddb.send(
		new PutCommand({
			TableName: TABLE,
			Item: item,
		}),
	);
	return item;
}

export async function getSummaryByArticleId(
	articleId: string,
): Promise<Summary | null> {
	const result = await ddb.send(
		new QueryCommand({
			TableName: TABLE,
			IndexName: "articleId-index",
			KeyConditionExpression: "articleId = :aid",
			ExpressionAttributeValues: { ":aid": articleId },
			Limit: 1,
			ScanIndexForward: false, // newest first
		}),
	);
	const items = result.Items as Summary[] | undefined;
	return items?.[0] ?? null;
}

export async function getSummaryById(id: string): Promise<Summary | null> {
	const result = await ddb.send(
		new GetCommand({
			TableName: TABLE,
			Key: { id },
		}),
	);
	return (result.Item as Summary | undefined) ?? null;
}

export async function getAllSummaries(): Promise<Summary[]> {
	const items: Summary[] = [];
	let lastKey: Record<string, unknown> | undefined;

	do {
		const result = await ddb.send(
			new ScanCommand({
				TableName: TABLE,
				ExclusiveStartKey: lastKey,
			}),
		);
		if (result.Items) {
			items.push(...(result.Items as Summary[]));
		}
		lastKey = result.LastEvaluatedKey;
	} while (lastKey);

	return items.sort(
		(a, b) =>
			new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);
}

export async function countSummaries(): Promise<number> {
	const result = await ddb.send(
		new ScanCommand({
			TableName: TABLE,
			Select: "COUNT",
		}),
	);
	return result.Count ?? 0;
}

export async function deleteSummaryById(id: string): Promise<void> {
	await ddb.send(
		new DeleteCommand({
			TableName: TABLE,
			Key: { id },
		}),
	);
}

export async function deleteSummaryByArticleId(articleId: string): Promise<boolean> {
	const summary = await getSummaryByArticleId(articleId);
	if (!summary) return false;
	await deleteSummaryById(summary.id);
	return true;
}
