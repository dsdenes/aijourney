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

	// Multi-tenant collections
	await db
		.collection("tenants")
		.createIndex({ slug: 1 }, { unique: true, name: "slug_unique" });
	console.log("  ✓ tenants");

	await db
		.collection("invitations")
		.createIndex({ token: 1 }, { unique: true, name: "token_unique" });
	await db
		.collection("invitations")
		.createIndex({ tenantId: 1, status: 1 }, { name: "tenantId_status" });
	await db
		.collection("invitations")
		.createIndex({ email: 1, tenantId: 1 }, { name: "email_tenantId" });
	await db
		.collection("invitations")
		.createIndex(
			{ expiresAt: 1 },
			{ name: "expiresAt_ttl", expireAfterSeconds: 0 },
		);
	console.log("  ✓ invitations");

	// Add tenantId compound indexes to existing collections
	await db
		.collection("users")
		.createIndex({ tenantId: 1, email: 1 }, { name: "tenantId_email" });
	await db
		.collection("users")
		.createIndex(
			{ googleId: 1 },
			{ unique: true, sparse: true, name: "googleId_unique" },
		);
	await db
		.collection("journeys")
		.createIndex(
			{ tenantId: 1, createdAt: -1 },
			{ name: "tenantId_createdAt_desc" },
		);
	await db
		.collection("run_requests")
		.createIndex({ tenantId: 1, status: 1 }, { name: "tenantId_status" });
	await db
		.collection("agent_runs")
		.createIndex(
			{ tenantId: 1, createdAt: -1 },
			{ name: "tenantId_createdAt_desc" },
		);
	await db
		.collection("memory_facts")
		.createIndex({ tenantId: 1, category: 1 }, { name: "tenantId_category" });
	console.log("  ✓ multi-tenant indexes");

	// Article recommendations
	await db
		.collection("article_recommendations")
		.createIndex(
			{ userId: 1, createdAt: -1 },
			{ name: "userId_createdAt_desc" },
		);
	await db
		.collection("article_recommendations")
		.createIndex({ userId: 1, status: 1 }, { name: "userId_status" });
	await db
		.collection("article_recommendations")
		.createIndex({ batchId: 1 }, { name: "batchId" });
	await db
		.collection("article_recommendations")
		.createIndex(
			{ tenantId: 1, createdAt: -1 },
			{ name: "tenantId_createdAt_desc" },
		);
	await db
		.collection("article_rec_batches")
		.createIndex(
			{ tenantId: 1, createdAt: -1 },
			{ name: "tenantId_createdAt_desc" },
		);
	await db
		.collection("article_rec_batches")
		.createIndex({ status: 1 }, { name: "status" });
	console.log("  ✓ article_recommendations + article_rec_batches");

	// Company documents
	await db
		.collection("company_documents")
		.createIndex(
			{ tenantId: 1, createdAt: -1 },
			{ name: "tenantId_createdAt_desc" },
		);
	await db
		.collection("company_documents")
		.createIndex(
			{ tenantId: 1, extractionStatus: 1 },
			{ name: "tenantId_extractionStatus" },
		);
	console.log("  ✓ company_documents");

	await client.close();
	console.log("Done!");
}

main().catch(console.error);
