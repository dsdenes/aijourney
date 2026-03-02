import type { AgentRun } from "@aijourney/shared";
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

const TABLE_NAME = "agent_runs";

@Injectable()
export class AgentRunsRepository {
	constructor(
		@Inject(DYNAMODB_CLIENT) private readonly db: DynamoDBDocumentClient,
	) {}

	async create(run: AgentRun): Promise<AgentRun> {
		await this.db.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: run,
			}),
		);
		return run;
	}

	async getById(id: string): Promise<AgentRun | undefined> {
		const result = await this.db.send(
			new GetCommand({ TableName: TABLE_NAME, Key: { id } }),
		);
		return result.Item as AgentRun | undefined;
	}

	async update(
		id: string,
		updates: Partial<AgentRun>,
	): Promise<void> {
		const entries = Object.entries(updates).filter(
			([key]) => key !== "id",
		);
		if (entries.length === 0) return;

		const ExpressionAttributeNames: Record<string, string> = {};
		const ExpressionAttributeValues: Record<string, unknown> = {};
		const updateParts: string[] = [];

		for (const [key, value] of entries) {
			const safeKey = key.replace(/[^a-zA-Z0-9]/g, "_");
			ExpressionAttributeNames[`#${safeKey}`] = key;
			ExpressionAttributeValues[`:${safeKey}`] = value;
			updateParts.push(`#${safeKey} = :${safeKey}`);
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

	async listAll(limit = 200): Promise<AgentRun[]> {
		const result = await this.db.send(
			new ScanCommand({
				TableName: TABLE_NAME,
				Limit: limit,
			}),
		);
		return (result.Items || []) as AgentRun[];
	}

	async listByAgent(agent: string, limit = 100): Promise<AgentRun[]> {
		const result = await this.db.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: "agent-createdAt-index",
				KeyConditionExpression: "agent = :agent",
				ExpressionAttributeValues: { ":agent": agent },
				ScanIndexForward: false,
				Limit: limit,
			}),
		);
		return (result.Items || []) as AgentRun[];
	}

	async listByStatus(status: string, limit = 100): Promise<AgentRun[]> {
		const result = await this.db.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: "status-createdAt-index",
				KeyConditionExpression: "#s = :status",
				ExpressionAttributeNames: { "#s": "status" },
				ExpressionAttributeValues: { ":status": status },
				ScanIndexForward: false,
				Limit: limit,
			}),
		);
		return (result.Items || []) as AgentRun[];
	}
}
