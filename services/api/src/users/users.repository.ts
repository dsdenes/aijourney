import type { User } from "@aijourney/shared";
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

const TABLE_NAME = "users";

@Injectable()
export class UsersRepository {
	constructor(@Inject(DYNAMODB_CLIENT) private readonly db: DynamoDBDocumentClient) {}

	async create(user: User): Promise<User> {
		await this.db.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: user,
				ConditionExpression: "attribute_not_exists(id)",
			}),
		);
		return user;
	}

	async getById(id: string): Promise<User | undefined> {
		const result = await this.db.send(
			new GetCommand({ TableName: TABLE_NAME, Key: { id } }),
		);
		return result.Item as User | undefined;
	}

	async getByEmail(email: string): Promise<User | undefined> {
		const result = await this.db.send(
			new QueryCommand({
				TableName: TABLE_NAME,
				IndexName: "email-index",
				KeyConditionExpression: "email = :email",
				ExpressionAttributeValues: { ":email": email },
				Limit: 1,
			}),
		);
		return result.Items?.[0] as User | undefined;
	}

	async update(id: string, updates: Partial<User>): Promise<void> {
		const entries = Object.entries(updates).filter(([k]) => k !== "id");
		if (entries.length === 0) return;

		const ExpressionAttributeNames: Record<string, string> = {};
		const ExpressionAttributeValues: Record<string, unknown> = {};
		const updateParts: string[] = [];

		for (const [key, value] of entries) {
			const attrName = `#${key}`;
			const attrValue = `:${key}`;
			ExpressionAttributeNames[attrName] = key;
			ExpressionAttributeValues[attrValue] = value;
			updateParts.push(`${attrName} = ${attrValue}`);
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

	async listAll(limit = 50): Promise<User[]> {
		const result = await this.db.send(
			new ScanCommand({ TableName: TABLE_NAME, Limit: limit }),
		);
		return (result.Items || []) as User[];
	}
}
