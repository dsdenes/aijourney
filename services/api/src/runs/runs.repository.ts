import type { RunRequest } from "@aijourney/shared";
import {
	type DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
	QueryCommand,
	ScanCommand,
	UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { Inject, Injectable } from "@nestjs/common";
import { DYNAMODB_CLIENT } from "../dynamodb/dynamodb.module";

const TABLE_NAME = "run_requests";

@Injectable()
export class RunsRepository {
	constructor(@Inject(DYNAMODB_CLIENT) private readonly db: DynamoDBDocumentClient) {}

	async create(run: RunRequest): Promise<RunRequest> {
		await this.db.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: run,
				ConditionExpression: "attribute_not_exists(id)",
			}),
		);
		return run;
	}

	async getById(id: string): Promise<RunRequest | undefined> {
		const result = await this.db.send(
			new GetCommand({ TableName: TABLE_NAME, Key: { id } }),
		);
		return result.Item as RunRequest | undefined;
	}

	async listByUser(userId: string): Promise<RunRequest[]> {
		const result = await this.db.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: "userId-status-index",
				KeyConditionExpression: "userId = :uid",
				ExpressionAttributeValues: { ":uid": userId },
			}),
		);
		return (result.Items || []) as RunRequest[];
	}

	async listByStatus(status: string): Promise<RunRequest[]> {
		const result = await this.db.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: "status-createdAt-index",
				KeyConditionExpression: "#s = :status",
				ExpressionAttributeNames: { "#s": "status" },
				ExpressionAttributeValues: { ":status": status },
				ScanIndexForward: false,
			}),
		);
		return (result.Items || []) as RunRequest[];
	}

	async updateStatus(
		id: string,
		status: string,
		extra: Record<string, unknown> = {},
	): Promise<void> {
		const updates: Record<string, unknown> = {
			status,
			updatedAt: new Date().toISOString(),
			...extra,
		};
		const entries = Object.entries(updates);

		const ExpressionAttributeNames: Record<string, string> = {};
		const ExpressionAttributeValues: Record<string, unknown> = {};
		const updateParts: string[] = [];

		for (const [key, value] of entries) {
			ExpressionAttributeNames[`#${key}`] = key;
			ExpressionAttributeValues[`:${key}`] = value;
			updateParts.push(`#${key} = :${key}`);
		}

		await this.db.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: { id },
				UpdateExpression: `SET ${updateParts.join(", ")}`,
				ExpressionAttributeNames,
				ExpressionAttributeValues,
			}),
		);
	}

	async listAll(limit = 100): Promise<RunRequest[]> {
		const result = await this.db.send(
			new ScanCommand({ TableName: TABLE_NAME, Limit: limit }),
		);
		return (result.Items || []) as RunRequest[];
	}
}
