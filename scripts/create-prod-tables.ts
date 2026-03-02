#!/usr/bin/env tsx
/**
 * Creates all DynamoDB tables in production AWS.
 * Usage: AWS_PROFILE=mito815 npx tsx scripts/create-prod-tables.ts
 */
import {
	CreateTableCommand,
	type CreateTableCommandInput,
	DynamoDBClient,
	ListTablesCommand,
} from "@aws-sdk/client-dynamodb";

// No endpoint = use real AWS DynamoDB
const client = new DynamoDBClient({ region: "eu-central-1" });

const tables: CreateTableCommandInput[] = [
	{
		TableName: "users",
		KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
		AttributeDefinitions: [
			{ AttributeName: "id", AttributeType: "S" },
			{ AttributeName: "email", AttributeType: "S" },
		],
		GlobalSecondaryIndexes: [
			{
				IndexName: "email-index",
				KeySchema: [{ AttributeName: "email", KeyType: "HASH" }],
				Projection: { ProjectionType: "ALL" },
			},
		],
		BillingMode: "PAY_PER_REQUEST",
	},
	{
		TableName: "journeys",
		KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
		AttributeDefinitions: [
			{ AttributeName: "id", AttributeType: "S" },
			{ AttributeName: "userId", AttributeType: "S" },
			{ AttributeName: "createdAt", AttributeType: "S" },
		],
		GlobalSecondaryIndexes: [
			{
				IndexName: "userId-createdAt-index",
				KeySchema: [
					{ AttributeName: "userId", KeyType: "HASH" },
					{ AttributeName: "createdAt", KeyType: "RANGE" },
				],
				Projection: { ProjectionType: "ALL" },
			},
		],
		BillingMode: "PAY_PER_REQUEST",
	},
	{
		TableName: "steps",
		KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
		AttributeDefinitions: [
			{ AttributeName: "id", AttributeType: "S" },
			{ AttributeName: "journeyId", AttributeType: "S" },
			{ AttributeName: "order", AttributeType: "N" },
		],
		GlobalSecondaryIndexes: [
			{
				IndexName: "journeyId-order-index",
				KeySchema: [
					{ AttributeName: "journeyId", KeyType: "HASH" },
					{ AttributeName: "order", KeyType: "RANGE" },
				],
				Projection: { ProjectionType: "ALL" },
			},
		],
		BillingMode: "PAY_PER_REQUEST",
	},
	{
		TableName: "kpis",
		KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
		AttributeDefinitions: [
			{ AttributeName: "id", AttributeType: "S" },
			{ AttributeName: "stepId", AttributeType: "S" },
		],
		GlobalSecondaryIndexes: [
			{
				IndexName: "stepId-index",
				KeySchema: [{ AttributeName: "stepId", KeyType: "HASH" }],
				Projection: { ProjectionType: "ALL" },
			},
		],
		BillingMode: "PAY_PER_REQUEST",
	},
	{
		TableName: "evidence",
		KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
		AttributeDefinitions: [
			{ AttributeName: "id", AttributeType: "S" },
			{ AttributeName: "kpiId", AttributeType: "S" },
			{ AttributeName: "submittedAt", AttributeType: "S" },
		],
		GlobalSecondaryIndexes: [
			{
				IndexName: "kpiId-submittedAt-index",
				KeySchema: [
					{ AttributeName: "kpiId", KeyType: "HASH" },
					{ AttributeName: "submittedAt", KeyType: "RANGE" },
				],
				Projection: { ProjectionType: "ALL" },
			},
		],
		BillingMode: "PAY_PER_REQUEST",
	},
	{
		TableName: "run_requests",
		KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
		AttributeDefinitions: [
			{ AttributeName: "id", AttributeType: "S" },
			{ AttributeName: "userId", AttributeType: "S" },
			{ AttributeName: "status", AttributeType: "S" },
			{ AttributeName: "createdAt", AttributeType: "S" },
		],
		GlobalSecondaryIndexes: [
			{
				IndexName: "userId-status-index",
				KeySchema: [
					{ AttributeName: "userId", KeyType: "HASH" },
					{ AttributeName: "status", KeyType: "RANGE" },
				],
				Projection: { ProjectionType: "ALL" },
			},
			{
				IndexName: "status-createdAt-index",
				KeySchema: [
					{ AttributeName: "status", KeyType: "HASH" },
					{ AttributeName: "createdAt", KeyType: "RANGE" },
				],
				Projection: { ProjectionType: "ALL" },
			},
		],
		BillingMode: "PAY_PER_REQUEST",
	},
	{
		TableName: "run_logs",
		KeySchema: [
			{ AttributeName: "runRequestId", KeyType: "HASH" },
			{ AttributeName: "timestamp", KeyType: "RANGE" },
		],
		AttributeDefinitions: [
			{ AttributeName: "runRequestId", AttributeType: "S" },
			{ AttributeName: "timestamp", AttributeType: "S" },
		],
		BillingMode: "PAY_PER_REQUEST",
	},
	{
		TableName: "agent_runs",
		KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
		AttributeDefinitions: [
			{ AttributeName: "id", AttributeType: "S" },
			{ AttributeName: "agent", AttributeType: "S" },
			{ AttributeName: "createdAt", AttributeType: "S" },
			{ AttributeName: "status", AttributeType: "S" },
		],
		GlobalSecondaryIndexes: [
			{
				IndexName: "agent-createdAt-index",
				KeySchema: [
					{ AttributeName: "agent", KeyType: "HASH" },
					{ AttributeName: "createdAt", KeyType: "RANGE" },
				],
				Projection: { ProjectionType: "ALL" },
			},
			{
				IndexName: "status-createdAt-index",
				KeySchema: [
					{ AttributeName: "status", KeyType: "HASH" },
					{ AttributeName: "createdAt", KeyType: "RANGE" },
				],
				Projection: { ProjectionType: "ALL" },
			},
		],
		BillingMode: "PAY_PER_REQUEST",
	},
	{
		TableName: "articles",
		KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
		AttributeDefinitions: [
			{ AttributeName: "id", AttributeType: "S" },
			{ AttributeName: "status", AttributeType: "S" },
			{ AttributeName: "crawledAt", AttributeType: "S" },
		],
		GlobalSecondaryIndexes: [
			{
				IndexName: "status-crawledAt-index",
				KeySchema: [
					{ AttributeName: "status", KeyType: "HASH" },
					{ AttributeName: "crawledAt", KeyType: "RANGE" },
				],
				Projection: { ProjectionType: "ALL" },
			},
		],
		BillingMode: "PAY_PER_REQUEST",
	},
	{
		TableName: "summaries",
		KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
		AttributeDefinitions: [
			{ AttributeName: "id", AttributeType: "S" },
			{ AttributeName: "articleId", AttributeType: "S" },
		],
		GlobalSecondaryIndexes: [
			{
				IndexName: "articleId-index",
				KeySchema: [{ AttributeName: "articleId", KeyType: "HASH" }],
				Projection: { ProjectionType: "ALL" },
			},
		],
		BillingMode: "PAY_PER_REQUEST",
	},
	{
		TableName: "events",
		KeySchema: [
			{ AttributeName: "userId", KeyType: "HASH" },
			{ AttributeName: "timestamp", KeyType: "RANGE" },
		],
		AttributeDefinitions: [
			{ AttributeName: "userId", AttributeType: "S" },
			{ AttributeName: "timestamp", AttributeType: "S" },
		],
		BillingMode: "PAY_PER_REQUEST",
	},
];

async function main() {
	console.log("Creating production DynamoDB tables...");

	const existing = await client.send(new ListTablesCommand({}));
	const existingNames = new Set(existing.TableNames || []);

	for (const table of tables) {
		const name = table.TableName!;
		if (existingNames.has(name)) {
			console.log(`  ✓ ${name} (already exists)`);
			continue;
		}
		try {
			await client.send(new CreateTableCommand(table));
			console.log(`  ✓ ${name} (created)`);
		} catch (err: any) {
			console.error(`  ✗ ${name}: ${err.message}`);
		}
	}

	console.log("Done!");
}

main().catch(console.error);
