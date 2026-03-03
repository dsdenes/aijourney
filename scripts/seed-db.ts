#!/usr/bin/env tsx
/**
 * Creates all MongoDB collections and indexes for local development.
 * Usage: pnpm run seed:db
 *
 * Replaces the old DynamoDB seed-db.ts.
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";

async function main() {
	console.log(`Connecting to MongoDB: ${uri}`);
	const client = new MongoClient(uri);
	await client.connect();
	const db = client.db("aijourney");

	// Create indexes (idempotent — createIndex is a no-op if index exists)
	console.log("Ensuring indexes...");

	await db
		.collection("users")
		.createIndex({ email: 1 }, { unique: true, name: "email_unique" });
	console.log("  ✓ users");

	await db
		.collection("journeys")
		.createIndex(
			{ userId: 1, createdAt: -1 },
			{ name: "userId_createdAt_desc" },
		);
	console.log("  ✓ journeys");

	await db
		.collection("steps")
		.createIndex({ journeyId: 1, order: 1 }, { name: "journeyId_order" });
	console.log("  ✓ steps");

	await db.collection("kpis").createIndex({ stepId: 1 }, { name: "stepId" });
	console.log("  ✓ kpis");

	await db
		.collection("evidence")
		.createIndex(
			{ kpiId: 1, submittedAt: -1 },
			{ name: "kpiId_submittedAt_desc" },
		);
	console.log("  ✓ evidence");

	await db
		.collection("run_requests")
		.createIndex({ userId: 1, status: 1 }, { name: "userId_status" });
	await db
		.collection("run_requests")
		.createIndex(
			{ status: 1, createdAt: -1 },
			{ name: "status_createdAt_desc" },
		);
	console.log("  ✓ run_requests");

	await db
		.collection("run_logs")
		.createIndex(
			{ runRequestId: 1, timestamp: 1 },
			{ unique: true, name: "runRequestId_timestamp_unique" },
		);
	console.log("  ✓ run_logs");

	await db
		.collection("agent_runs")
		.createIndex({ agent: 1, createdAt: -1 }, { name: "agent_createdAt_desc" });
	await db
		.collection("agent_runs")
		.createIndex(
			{ status: 1, createdAt: -1 },
			{ name: "status_createdAt_desc" },
		);
	console.log("  ✓ agent_runs");

	await db
		.collection("articles")
		.createIndex(
			{ status: 1, fetchedAt: -1 },
			{ name: "status_fetchedAt_desc" },
		);
	await db
		.collection("articles")
		.createIndex({ url: 1 }, { unique: true, name: "url_unique" });
	console.log("  ✓ articles");

	await db
		.collection("summaries")
		.createIndex({ articleId: 1 }, { name: "articleId" });
	console.log("  ✓ summaries");

	await db
		.collection("events")
		.createIndex(
			{ userId: 1, timestamp: -1 },
			{ name: "userId_timestamp_desc" },
		);
	console.log("  ✓ events");

	await client.close();
	console.log("Done!");
}

main().catch(console.error);
