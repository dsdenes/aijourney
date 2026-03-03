// scripts/mongo-init.js
// Executed by MongoDB's docker-entrypoint-initdb.d on first run

db = db.getSiblingDB("aijourney");

// ── users ──
db.createCollection("users");
db.users.createIndex({ email: 1 }, { unique: true, name: "email_unique" });

// ── journeys ──
db.createCollection("journeys");
db.journeys.createIndex(
	{ userId: 1, createdAt: -1 },
	{ name: "userId_createdAt_desc" },
);

// ── steps ──
db.createCollection("steps");
db.steps.createIndex({ journeyId: 1, order: 1 }, { name: "journeyId_order" });

// ── kpis ──
db.createCollection("kpis");
db.kpis.createIndex({ stepId: 1 }, { name: "stepId" });

// ── evidence ──
db.createCollection("evidence");
db.evidence.createIndex(
	{ kpiId: 1, submittedAt: -1 },
	{ name: "kpiId_submittedAt_desc" },
);

// ── run_requests ──
db.createCollection("run_requests");
db.run_requests.createIndex({ userId: 1, status: 1 }, { name: "userId_status" });
db.run_requests.createIndex(
	{ status: 1, createdAt: -1 },
	{ name: "status_createdAt_desc" },
);

// ── run_logs ──
db.createCollection("run_logs");
db.run_logs.createIndex(
	{ runRequestId: 1, timestamp: 1 },
	{ unique: true, name: "runRequestId_timestamp_unique" },
);

// ── agent_runs ──
db.createCollection("agent_runs");
db.agent_runs.createIndex(
	{ agent: 1, createdAt: -1 },
	{ name: "agent_createdAt_desc" },
);
db.agent_runs.createIndex(
	{ status: 1, createdAt: -1 },
	{ name: "status_createdAt_desc" },
);

// ── articles ──
db.createCollection("articles");
db.articles.createIndex(
	{ status: 1, fetchedAt: -1 },
	{ name: "status_fetchedAt_desc" },
);
db.articles.createIndex({ url: 1 }, { unique: true, name: "url_unique" });

// ── summaries ──
db.createCollection("summaries");
db.summaries.createIndex({ articleId: 1 }, { name: "articleId" });

// ── events ──
db.createCollection("events");
db.events.createIndex(
	{ userId: 1, timestamp: -1 },
	{ name: "userId_timestamp_desc" },
);

print("✓ All collections and indexes created for aijourney");
