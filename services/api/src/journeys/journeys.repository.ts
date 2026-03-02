import type { Journey } from "@aijourney/shared";
import {
	type DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
	QueryCommand,
	UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { Inject, Injectable } from "@nestjs/common";
import { DYNAMODB_CLIENT } from "../dynamodb/dynamodb.module";

const TABLE_NAME = "journeys";

@Injectable()
export class JourneysRepository {
	constructor(@Inject(DYNAMODB_CLIENT) private readonly db: DynamoDBDocumentClient) {}

	async create(journey: Journey): Promise<Journey> {
		await this.db.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: journey,
				ConditionExpression: "attribute_not_exists(id)",
			}),
		);
		return journey;
	}

	async getById(id: string): Promise<Journey | undefined> {
		const result = await this.db.send(
			new GetCommand({ TableName: TABLE_NAME, Key: { id } }),
		);
		return result.Item as Journey | undefined;
	}

	async listByUser(userId: string): Promise<Journey[]> {
		const result = await this.db.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: "userId-createdAt-index",
				KeyConditionExpression: "userId = :uid",
				ExpressionAttributeValues: { ":uid": userId },
				ScanIndexForward: false,
			}),
		);
		return (result.Items || []) as Journey[];
	}

	async update(id: string, updates: Partial<Journey>): Promise<void> {
		const entries = Object.entries(updates).filter(([k]) => k !== "id");
		if (entries.length === 0) return;

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
}
