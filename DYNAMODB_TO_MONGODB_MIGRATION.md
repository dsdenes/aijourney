# DynamoDB → MongoDB Migration Plan

> **Scope**: Replace DynamoDB Local (Docker) with self-hosted MongoDB across all services
> **Server**: Scaleway `root@51.15.108.144` — tenderai already runs `mongo:8` on this host
> **Services affected**: `services/api`, `services/kb-builder`, `services/worker`, `scripts/`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Inventory](#2-current-state-inventory)
3. [MongoDB Collection Design](#3-mongodb-collection-design)
4. [Driver & Library Choice](#4-driver--library-choice)
5. [Implementation Plan by Service](#5-implementation-plan-by-service)
6. [Docker Compose Changes](#6-docker-compose-changes)
7. [Data Migration Script](#7-data-migration-script)
8. [Testing Strategy](#8-testing-strategy)
9. [Rollout Plan](#9-rollout-plan)
10. [Rollback Strategy](#10-rollback-strategy)
11. [Post-Migration Cleanup](#11-post-migration-cleanup)

---

## 1. Executive Summary

### Why Migrate?

| Concern | DynamoDB Local | MongoDB |
|---|---|---|
| **Production viability** | DynamoDB Local is a testing tool, not a production database — no replication, no backups, weak durability | Full production database with replica sets, journaling, point-in-time recovery |
| **Query flexibility** | Rigid key-schema; any new access pattern requires a GSI (pre-planned) | Ad-hoc queries on any field; aggregation pipeline for analytics |
| **Cost** | Free (local), but AWS DynamoDB is expensive at scale | Free (self-hosted), rich query layer at no extra cost |
| **Operational synergy** | Only aijourney uses DynamoDB Local | tenderai already runs `mongo:8` on the same server |
| **Developer experience** | Verbose SDK (Get/Put/Query/Scan commands, expression builders) | Concise driver API (`find`, `insertOne`, `updateOne`) |
| **Data modeling** | Flat attributes, no joins, no embedded documents | Nested documents, `$lookup` for joins, powerful aggregation |

### Migration Scope

- **11 DynamoDB tables** → **11 MongoDB collections** (1:1 mapping for simplicity)
- **9 repository files** to rewrite (4 in API, 3 in KB Builder, 1 health check, 1 DynamoDB module)
- **2 scripts** to rewrite (`seed-db.ts`, `create-prod-tables.ts`)
- **2 Docker Compose files** to update (`docker-compose.yml`, `docker-compose.server.yml`)
- **5 tables with no repository code** — only need collection + index creation

### Estimated Effort

| Phase | Tasks | Estimate |
|---|---|---|
| Phase 1: Infrastructure | MongoDB in Docker, connection module | 2-3 hours |
| Phase 2: API repositories | Rewrite 4 repos + health check + DI module | 4-6 hours |
| Phase 3: KB Builder repositories | Rewrite 3 files (article, summary, agent-run-logger) | 3-4 hours |
| Phase 4: Scripts & seed data | Rewrite seed-db.ts, create-prod-tables.ts → init script | 1-2 hours |
| Phase 5: Testing & validation | Run test suites, manual E2E verification | 2-3 hours |
| Phase 6: Cleanup | Remove AWS SDK DynamoDB deps, old code | 1 hour |
| **Total** | | **13-19 hours** |

---

## 2. Current State Inventory

### 2.1 DynamoDB Tables (11)

#### Tables WITH Active Repository Code (6 tables, 7 repo files)

| # | Table | Primary Key | GSIs | Repo File(s) | Access Patterns |
|---|---|---|---|---|---|
| 1 | `users` | `id` (HASH) | `email-index` (email→HASH) | `api/users/users.repository.ts` | create, getById, getByEmail, update, listAll(scan) |
| 2 | `journeys` | `id` (HASH) | `userId-createdAt-index` (userId→HASH, createdAt→RANGE) | `api/journeys/journeys.repository.ts` | create, getById, listByUser(sorted desc), update |
| 3 | `run_requests` | `id` (HASH) | `userId-status-index` (userId→HASH, status→RANGE), `status-createdAt-index` (status→HASH, createdAt→RANGE) | `api/runs/runs.repository.ts` | create, getById, listByUser, listByStatus(sorted desc), updateStatus, listAll(scan) |
| 4 | `agent_runs` | `id` (HASH) | `agent-createdAt-index` (agent→HASH, createdAt→RANGE), `status-createdAt-index` (status→HASH, createdAt→RANGE) | `api/agent-runs/agent-runs.repository.ts` + `kb-builder/agent-run-logger.ts` | create, getById, update, listAll(scan), listByAgent(sorted desc), listByStatus(sorted desc), startAgentRun, completeAgentRun, failAgentRun |
| 5 | `articles` | `id` (HASH) | `status-crawledAt-index` (status→HASH, crawledAt→RANGE) | `kb-builder/article-repository.ts` | save, getByUrl(scan+filter!), getAll(paginated scan), getByStatus(query), getById, count(scan), updateStatus, backfillCrawledAt, delete |
| 6 | `summaries` | `id` (HASH) | `articleId-index` (articleId→HASH) | `kb-builder/summary-repository.ts` | save, getByArticleId, getById, getAll(paginated scan), count(scan), delete, deleteByArticleId |

#### Tables WITHOUT Repository Code (5 — schema-only, no access code)

| # | Table | Primary Key | GSIs | Status |
|---|---|---|---|---|
| 7 | `steps` | `id` (HASH) | `journeyId-order-index` (journeyId→HASH, order→RANGE) | Created but unused |
| 8 | `kpis` | `id` (HASH) | `stepId-index` (stepId→HASH) | Created but unused |
| 9 | `evidence` | `id` (HASH) | `kpiId-submittedAt-index` (kpiId→HASH, submittedAt→RANGE) | Created but unused |
| 10 | `run_logs` | `runRequestId` (HASH) + `timestamp` (RANGE) | None | Created but unused |
| 11 | `events` | `userId` (HASH) + `timestamp` (RANGE) | None | Created but unused |

### 2.2 DynamoDB Client Patterns

**Pattern A — NestJS Dependency Injection (API service)**
```typescript
// dynamodb.module.ts — Global module providing DYNAMODB_CLIENT token
@Global() @Module({
  providers: [{
    provide: DYNAMODB_CLIENT,
    useFactory: (config: AppConfigService) => {
      const client = new DynamoDBClient({ region, endpoint });
      return DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
    },
    inject: [AppConfigService],
  }],
  exports: [DYNAMODB_CLIENT],
})
```

Consumers: `@Inject(DYNAMODB_CLIENT) private readonly db: DynamoDBDocumentClient`

**Pattern B — Direct Instantiation (KB Builder)**
```typescript
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "eu-central-1",
  ...(process.env.DYNAMODB_ENDPOINT && { endpoint: process.env.DYNAMODB_ENDPOINT }),
});
const ddb = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
```

### 2.3 AWS SDK Dependencies

| Package | Used In |
|---|---|
| `@aws-sdk/client-dynamodb` | api, kb-builder, scripts |
| `@aws-sdk/lib-dynamodb` | api, kb-builder, scripts |

> **Note**: AWS SDK is also used for Cognito, S3, Bedrock — only the DynamoDB packages will be removed.

### 2.4 Docker Compose (Current)

```yaml
# docker-compose.server.yml (production)
dynamodb-local:
  image: amazon/dynamodb-local:latest
  user: root
  volumes:
    - dynamodb_data:/home/dynamodblocal/data
  command: "-jar DynamoDBLocal.jar -sharedDb -dbPath /home/dynamodblocal/data"

seed-db:
  build: { context: ., target: seed }
  depends_on:
    dynamodb-local: { condition: service_healthy }
  environment:
    DYNAMODB_ENDPOINT: http://dynamodb-local:8000
```

---

## 3. MongoDB Collection Design

### 3.1 Design Principles

1. **1:1 table→collection mapping** — Keep the migration simple and reversible. No embedding changes.
2. **`_id` as string** — DynamoDB uses `id` (string, ULID). MongoDB uses `_id`. We'll use `_id: string` instead of ObjectId to preserve existing IDs and avoid changing the shared types.
3. **Indexes replace GSIs** — Each GSI becomes a MongoDB index. Compound GSIs become compound indexes.
4. **Composite keys become compound `_id`** — Tables with composite keys (run_logs, events) use `{ _id: { pk, sk } }` or separate fields with a compound unique index.

### 3.2 Collection Schemas & Indexes

#### `users`
```javascript
// Document shape: { _id: string, googleId, email, name, avatarUrl?, role, department?,
//   jobTitle?, jobDescription?, onboardingComplete, preferences: { tools?, workflows?,
//   comfortLevel?, goals?, completedPractices? }, createdAt, updatedAt, lastLoginAt }

db.users.createIndex({ email: 1 }, { unique: true, name: "email_unique" })
```

> **Improvement over DynamoDB**: `email` GSI was not unique-constrained in DynamoDB. MongoDB can enforce uniqueness natively.

#### `journeys`
```javascript
// Document shape: { _id: string, userId, version, title, description, status,
//   currentLevel, competencyAreas: [], generatedBy, metadata: {}, createdAt, updatedAt }

db.journeys.createIndex({ userId: 1, createdAt: -1 }, { name: "userId_createdAt_desc" })
```

#### `steps`
```javascript
// Document shape: { _id: string, journeyId, level, order, title, description, task,
//   expectedOutput, evidenceType, kpiTargets: [], reviewMethod, tags: [], toolsRequired?,
//   estimatedMinutes?, status, completedAt?, createdAt, updatedAt }

db.steps.createIndex({ journeyId: 1, order: 1 }, { name: "journeyId_order" })
```

#### `kpis`
```javascript
// Document shape: { _id: string, name, description, category, measurementType,
//   rubricLevels?: [], unit?, direction, targetValue?, isGlobal, createdAt }

db.kpis.createIndex({ stepId: 1 }, { name: "stepId" })
```

> **Note**: The `stepId` field isn't in the shared KPI type but is defined as a GSI attribute. Verify intent when implementing.

#### `evidence`
```javascript
// Document shape: { _id: string, stepId, userId, type, content: {}, kpiMeasurements: [],
//   reviewStatus, reviewNotes?, reviewedBy?, submittedAt, reviewedAt? }

db.evidence.createIndex({ kpiId: 1, submittedAt: -1 }, { name: "kpiId_submittedAt_desc" })
```

#### `run_requests`
```javascript
// Document shape: { _id: string, userId, purpose, status, inputs: {}, budget: {},
//   approval: {}, execution?: {}, cancelledBy?, cancelledAt?, createdAt, updatedAt }

db.run_requests.createIndex({ userId: 1, status: 1 }, { name: "userId_status" })
db.run_requests.createIndex({ status: 1, createdAt: -1 }, { name: "status_createdAt_desc" })
```

#### `run_logs`
```javascript
// Document shape: { _id: string (generated), runRequestId, timestamp, event, actor,
//   details: {}, tokensUsedSoFar?, costSoFar? }
// DynamoDB used composite key (runRequestId + timestamp). In MongoDB, use a generated _id
// with a compound index for the query pattern.

db.run_logs.createIndex(
  { runRequestId: 1, timestamp: 1 },
  { unique: true, name: "runRequestId_timestamp_unique" }
)
```

#### `agent_runs`
```javascript
// Document shape: { _id: string, agent, status, input, output?, fullInput?, fullOutput?,
//   model?, tokensUsed?, promptTokens?, completionTokens?, durationMs?, error?,
//   metadata?: {}, createdAt, completedAt? }

db.agent_runs.createIndex({ agent: 1, createdAt: -1 }, { name: "agent_createdAt_desc" })
db.agent_runs.createIndex({ status: 1, createdAt: -1 }, { name: "status_createdAt_desc" })
```

#### `articles`
```javascript
// Document shape: { _id: string, url, title, source, fetchedAt, contentHash, s3Key,
//   status, qualityScore?, metadata: {}, dedupe: {}, ingestionRunId?, createdAt, updatedAt }

db.articles.createIndex({ status: 1, fetchedAt: -1 }, { name: "status_fetchedAt_desc" })
db.articles.createIndex({ url: 1 }, { unique: true, name: "url_unique" })
```

> **Improvement over DynamoDB**: `getArticleByUrl()` currently does a full table Scan with filter — MongoDB can use a `url` unique index for O(1) lookup.

#### `summaries`
```javascript
// Document shape: { _id: string, articleId, runRequestId, version, content: {},
//   bedrockKbDocId?, model, promptVersion, tokensUsed, promptTokens?, completionTokens?,
//   createdAt }

db.summaries.createIndex({ articleId: 1 }, { name: "articleId" })
```

#### `events`
```javascript
// Document shape: { _id: string (generated), userId, timestamp, eventId, event,
//   properties: {}, sessionId }
// DynamoDB used composite key (userId + timestamp). In MongoDB, use generated _id
// with compound index.

db.events.createIndex(
  { userId: 1, timestamp: -1 },
  { name: "userId_timestamp_desc" }
)
```

### 3.3 Field Mapping: `id` → `_id`

The shared types use `id: string`. MongoDB's native primary key is `_id`. Two options:

**Option A (Recommended): Alias `id` ↔ `_id` in the repository layer**

Keep `id` in the shared types unchanged. In each repository, map `id` → `_id` on write and `_id` → `id` on read:

```typescript
// Helper functions (packages/shared or per-service utility)
function toMongoDoc<T extends { id: string }>(doc: T): Omit<T, 'id'> & { _id: string } {
  const { id, ...rest } = doc;
  return { _id: id, ...rest };
}

function fromMongoDoc<T>(doc: { _id: string } & Record<string, unknown>): T {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as T;
}
```

**Option B: Keep `_id` as-is, add virtual `id` getter**

Use Mongoose with a `toJSON` virtual that exposes `_id` as `id`. This couples you to Mongoose.

**Recommendation**: Option A. Minimal surface area, no dependency on Mongoose, shared types stay clean.

---

## 4. Driver & Library Choice

### Comparison

| Criteria | Native MongoDB Driver (`mongodb`) | Mongoose |
|---|---|---|
| **Pattern match** | Closest to current DynamoDB SDK style (imperative commands) | ODM with schema validation, middleware, virtuals |
| **Bundle size** | ~600KB | ~2MB (includes `mongodb` as dep) |
| **Type safety** | Good with generics: `Collection<User>` | Excellent with `Schema<IUser>` |
| **Schema enforcement** | Use MongoDB JSON Schema validation or validate in app (Zod already does this) | Built-in schema, but duplicates Zod |
| **Learning curve** | Minimal for team (similar to DynamoDB SDK) | Moderate (new concepts: middleware, population, etc.) |
| **Performance** | Direct, no ORM overhead | Slight overhead from hydration |

### Recommendation: **Native MongoDB Driver (`mongodb` v6+)**

Reasons:
1. **Zod is already the validation layer** — Mongoose schemas would duplicate Zod schemas in `packages/shared`
2. **Repository pattern is already established** — Each repo file manually constructs queries; this maps directly to MongoDB native driver
3. **Simpler migration** — Replace `PutCommand` → `insertOne`, `GetCommand` → `findOne`, `QueryCommand` → `find`, `ScanCommand` → `find({})`, `UpdateCommand` → `updateOne`, `DeleteCommand` → `deleteOne`
4. **No new abstractions** — Team doesn't need to learn Mongoose concepts (middleware, virtuals, population, discriminators)

### Package to Install

```bash
pnpm add mongodb            # Root or per-service
pnpm add -D @types/mongodb  # Not needed for mongodb v6+ (ships own types)
```

> `mongodb` v6+ has built-in TypeScript types. No `@types/mongodb` needed.

---

## 5. Implementation Plan by Service

### 5.1 Shared: MongoDB Connection Utility

Create `packages/shared/src/utils/mongodb.ts`:

```typescript
import { MongoClient, type Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectMongo(uri: string, dbName = "aijourney"): Promise<Db> {
  if (db) return db;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error("MongoDB not connected. Call connectMongo() first.");
  return db;
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
```

### 5.2 API Service — NestJS Module

Replace `services/api/src/dynamodb/dynamodb.module.ts` with `services/api/src/mongodb/mongodb.module.ts`:

```typescript
import { type Db, MongoClient } from "mongodb";
import { Global, Module } from "@nestjs/common";
import { AppConfigService } from "../config/config.service";

export const MONGODB_DB = "MONGODB_DB";
export const MONGODB_CLIENT = "MONGODB_CLIENT";

@Global()
@Module({
  providers: [
    {
      provide: MONGODB_CLIENT,
      useFactory: async (config: AppConfigService) => {
        const client = new MongoClient(config.config.MONGODB_URI);
        await client.connect();
        return client;
      },
      inject: [AppConfigService],
    },
    {
      provide: MONGODB_DB,
      useFactory: (client: MongoClient) => client.db("aijourney"),
      inject: [MONGODB_CLIENT],
    },
  ],
  exports: [MONGODB_DB, MONGODB_CLIENT],
})
export class MongoDBModule {}
```

Add `MONGODB_URI` to `AppConfigService` config schema:

```typescript
MONGODB_URI: z.string().url().default("mongodb://localhost:27017"),
```

Update `app.module.ts`: Replace `DynamoDBModule` → `MongoDBModule` in imports.

### 5.3 API Repositories — Rewrite Guide

Each repository follows the same transformation pattern. Here's the mapping:

#### DynamoDB → MongoDB Operation Mapping

| DynamoDB | MongoDB | Notes |
|---|---|---|
| `PutCommand({ Item })` | `collection.insertOne(doc)` | Map `id` → `_id` |
| `GetCommand({ Key: { id } })` | `collection.findOne({ _id: id })` | Map `_id` → `id` in result |
| `QueryCommand({ IndexName, KeyCondition })` | `collection.find(filter).sort(sort).toArray()` | Index is implicit (created on init) |
| `ScanCommand({})` | `collection.find({}).limit(n).toArray()` | No 1MB page limit in MongoDB |
| `UpdateCommand({ UpdateExpression })` | `collection.updateOne({ _id: id }, { $set: updates })` | Much simpler syntax |
| `DeleteCommand({ Key })` | `collection.deleteOne({ _id: id })` | Identical concept |
| `ScanCommand({ FilterExpression })` | `collection.findOne({ field: value })` | Direct query, no scan needed |
| `ScanCommand({ Select: "COUNT" })` | `collection.countDocuments({})` | Native count |

#### Example: `users.repository.ts` (before → after)

**Before (DynamoDB):**
```typescript
@Injectable()
export class UsersRepository {
  constructor(@Inject(DYNAMODB_CLIENT) private readonly db: DynamoDBDocumentClient) {}

  async getByEmail(email: string): Promise<User | undefined> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: "users",
        IndexName: "email-index",
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: { ":email": email },
        Limit: 1,
      }),
    );
    return result.Items?.[0] as User | undefined;
  }
}
```

**After (MongoDB):**
```typescript
@Injectable()
export class UsersRepository {
  private readonly collection;

  constructor(@Inject(MONGODB_DB) private readonly db: Db) {
    this.collection = db.collection("users");
  }

  async getByEmail(email: string): Promise<User | undefined> {
    const doc = await this.collection.findOne({ email });
    return doc ? fromMongoDoc<User>(doc) : undefined;
  }

  async create(user: User): Promise<User> {
    await this.collection.insertOne(toMongoDoc(user));
    return user;
  }

  async getById(id: string): Promise<User | undefined> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? fromMongoDoc<User>(doc) : undefined;
  }

  async update(id: string, updates: Partial<User>): Promise<void> {
    const { id: _, ...rest } = updates;
    if (Object.keys(rest).length === 0) return;
    await this.collection.updateOne({ _id: id }, { $set: rest });
  }

  async listAll(limit = 50): Promise<User[]> {
    const docs = await this.collection.find({}).limit(limit).toArray();
    return docs.map(d => fromMongoDoc<User>(d));
  }
}
```

### 5.4 Full Repository Rewrite Checklist

#### API Service (NestJS DI pattern — inject `MONGODB_DB`)

| File | Collection | Methods | Complexity |
|---|---|---|---|
| `users.repository.ts` | `users` | create, getById, getByEmail, update, listAll | Simple |
| `journeys.repository.ts` | `journeys` | create, getById, listByUser, update | Simple |
| `runs.repository.ts` | `run_requests` | create, getById, listByUser, listByStatus, updateStatus, listAll | Medium |
| `agent-runs.repository.ts` | `agent_runs` | create, getById, update, listAll, listByAgent, listByStatus | Medium |
| `health.service.ts` | `users` | Scan limit 1 → `findOne({})` | Trivial |

#### KB Builder (direct connection — use shared `getDb()`)

| File | Collection | Methods | Complexity |
|---|---|---|---|
| `article-repository.ts` | `articles` | save, getByUrl, getAll, getByStatus, getById, count, updateStatus, backfillCrawledAt, delete | Medium-High |
| `summary-repository.ts` | `summaries` | save, getByArticleId, getById, getAll, count, delete, deleteByArticleId | Medium |
| `agent-run-logger.ts` | `agent_runs` | startAgentRun, completeAgentRun (read-modify-write), failAgentRun | Medium |

### 5.5 KB Builder Connection Pattern

Replace the per-file DynamoDB client instantiation with shared MongoDB connection:

```typescript
// kb-builder/src/db.ts
import { MongoClient, type Db } from "mongodb";

let db: Db | null = null;

export async function initDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  const client = new MongoClient(uri);
  await client.connect();
  db = client.db("aijourney");
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error("DB not initialized");
  return db;
}
```

Call `initDb()` in the KB Builder's startup (app.ts). Each repository imports `getDb()`:

```typescript
// article-repository.ts (after)
import { getDb } from "./db.js";
import type { Article, ArticleStatus } from "@aijourney/shared";

function col() {
  return getDb().collection("articles");
}

export async function getArticleByUrl(url: string): Promise<Article | null> {
  // Direct indexed query instead of DynamoDB Scan+Filter!
  const doc = await col().findOne({ url });
  return doc ? fromMongoDoc<Article>(doc) : null;
}
```

### 5.6 Worker Service

The worker uses Redis/BullMQ for job processing and the `DYNAMODB_ENDPOINT` env var is passed in Docker Compose. Verify:
- If the worker directly imports DynamoDB — rewrite needed
- If it only uses Redis + HTTP calls to the API — only env var cleanup needed

Based on research, `services/api/src/workers/workers.service.ts` does NOT access DynamoDB — it only manages BullMQ queues and proxies to KB Builder. The separate `services/worker/` likely follows the same pattern. **Action**: Verify and remove `DYNAMODB_ENDPOINT` env var from the worker container config.

### 5.7 Health Check Update

```typescript
// health.service.ts (after)
@Injectable()
export class HealthService {
  constructor(@Inject(MONGODB_DB) private readonly db: Db) {}

  async check() {
    const checks: Record<string, string> = {};
    try {
      await this.db.command({ ping: 1 });
      checks["mongodb"] = "connected";
    } catch (error) {
      this.logger.warn("MongoDB health check failed", error);
      checks["mongodb"] = "disconnected";
    }
    // ... rest unchanged
  }
}
```

---

## 6. Docker Compose Changes

### 6.1 Replace DynamoDB Local with MongoDB

**Before:**
```yaml
dynamodb-local:
  image: amazon/dynamodb-local:latest
  user: root
  volumes:
    - dynamodb_data:/home/dynamodblocal/data
  command: "-jar DynamoDBLocal.jar -sharedDb -dbPath /home/dynamodblocal/data"
  healthcheck:
    test: ["CMD-SHELL", "bash -c 'echo > /dev/tcp/localhost/8000' 2>/dev/null || exit 1"]
    interval: 10s
    timeout: 5s
    retries: 5

seed-db:
  build: { context: ., target: seed }
  depends_on:
    dynamodb-local: { condition: service_healthy }
  environment:
    DYNAMODB_ENDPOINT: http://dynamodb-local:8000
```

**After:**
```yaml
mongodb:
  image: mongo:8
  restart: unless-stopped
  volumes:
    - mongo_data:/data/db
    - ./scripts/mongo-init.js:/docker-entrypoint-initdb.d/01-init.js:ro
  environment:
    MONGO_INITDB_DATABASE: aijourney
  healthcheck:
    test: ["CMD", "mongosh", "--eval", "db.runCommand('ping').ok", "--quiet"]
    interval: 10s
    timeout: 5s
    retries: 5
```

> MongoDB's `/docker-entrypoint-initdb.d/` automatically runs JS/SH scripts on first startup — no separate `seed-db` service needed.

### 6.2 Environment Variable Changes

| Service | Remove | Add |
|---|---|---|
| `api` | `DYNAMODB_ENDPOINT` | `MONGODB_URI: mongodb://mongodb:27017/aijourney` |
| `kb-builder` | `DYNAMODB_ENDPOINT` | `MONGODB_URI: mongodb://mongodb:27017/aijourney` |
| `worker` | `DYNAMODB_ENDPOINT` | `MONGODB_URI: mongodb://mongodb:27017/aijourney` |
| `seed-db` | (remove entire service) | — |

### 6.3 Volume Changes

```yaml
volumes:
  # Remove:
  # dynamodb_data:
  # Add:
  mongo_data:
  redis_data:
  qdrant_data:
```

### 6.4 Dependency Changes

```yaml
api:
  depends_on:
    mongodb:
      condition: service_healthy  # was: dynamodb-local + seed-db
    redis:
      condition: service_healthy

kb-builder:
  depends_on:
    mongodb:
      condition: service_healthy  # was: dynamodb-local
```

### 6.5 Local Dev (docker-compose.yml)

Same pattern — replace `dynamodb-local` with `mongodb`. Update the `pnpm watch` script comment accordingly.

### 6.6 Memory Consideration

Current server has **7.7GB RAM** with these services running. DynamoDB Local JVM typically uses 200-400MB. MongoDB with WiredTiger defaults to using 50% of `(RAM - 1GB)` for cache, which would be ~3.3GB. For a shared server, limit MongoDB's cache:

```yaml
mongodb:
  image: mongo:8
  command: ["mongod", "--wiredTigerCacheSizeGB", "0.5"]
  # ...
```

This limits MongoDB's cache to 500MB — appropriate given the dataset size and co-located services.

---

## 7. Data Migration Script

### 7.1 MongoDB Init Script (for fresh deployments)

Create `scripts/mongo-init.js` — runs automatically on first MongoDB start:

```javascript
// scripts/mongo-init.js
// Executed by MongoDB's docker-entrypoint-initdb.d on first run

db = db.getSiblingDB("aijourney");

// ── users ──
db.createCollection("users");
db.users.createIndex({ email: 1 }, { unique: true, name: "email_unique" });

// ── journeys ──
db.createCollection("journeys");
db.journeys.createIndex({ userId: 1, createdAt: -1 }, { name: "userId_createdAt_desc" });

// ── steps ──
db.createCollection("steps");
db.steps.createIndex({ journeyId: 1, order: 1 }, { name: "journeyId_order" });

// ── kpis ──
db.createCollection("kpis");
db.kpis.createIndex({ stepId: 1 }, { name: "stepId" });

// ── evidence ──
db.createCollection("evidence");
db.evidence.createIndex({ kpiId: 1, submittedAt: -1 }, { name: "kpiId_submittedAt_desc" });

// ── run_requests ──
db.createCollection("run_requests");
db.run_requests.createIndex({ userId: 1, status: 1 }, { name: "userId_status" });
db.run_requests.createIndex({ status: 1, createdAt: -1 }, { name: "status_createdAt_desc" });

// ── run_logs ──
db.createCollection("run_logs");
db.run_logs.createIndex(
  { runRequestId: 1, timestamp: 1 },
  { unique: true, name: "runRequestId_timestamp_unique" }
);

// ── agent_runs ──
db.createCollection("agent_runs");
db.agent_runs.createIndex({ agent: 1, createdAt: -1 }, { name: "agent_createdAt_desc" });
db.agent_runs.createIndex({ status: 1, createdAt: -1 }, { name: "status_createdAt_desc" });

// ── articles ──
db.createCollection("articles");
db.articles.createIndex({ status: 1, fetchedAt: -1 }, { name: "status_fetchedAt_desc" });
db.articles.createIndex({ url: 1 }, { unique: true, name: "url_unique" });

// ── summaries ──
db.createCollection("summaries");
db.summaries.createIndex({ articleId: 1 }, { name: "articleId" });

// ── events ──
db.createCollection("events");
db.events.createIndex({ userId: 1, timestamp: -1 }, { name: "userId_timestamp_desc" });

print("✓ All collections and indexes created for aijourney");
```

### 7.2 Data Migration Script (for existing data)

Create `scripts/migrate-dynamo-to-mongo.ts` — one-time script to move existing data:

```typescript
#!/usr/bin/env tsx
/**
 * Migrates all data from DynamoDB Local to MongoDB.
 * Assumes both databases are running and accessible.
 *
 * Usage:
 *   DYNAMODB_ENDPOINT=http://localhost:8000 MONGODB_URI=mongodb://localhost:27017 \
 *   npx tsx scripts/migrate-dynamo-to-mongo.ts
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { MongoClient } from "mongodb";

const TABLES = [
  "users", "journeys", "steps", "kpis", "evidence",
  "run_requests", "run_logs", "agent_runs", "articles", "summaries", "events",
];

// Tables with composite keys (need _id generation)
const COMPOSITE_KEY_TABLES: Record<string, { pk: string; sk: string }> = {
  run_logs: { pk: "runRequestId", sk: "timestamp" },
  events: { pk: "userId", sk: "timestamp" },
};

async function scanAll(ddb: DynamoDBDocumentClient, table: string) {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(
      new ScanCommand({ TableName: table, ExclusiveStartKey: lastKey })
    );
    if (result.Items) items.push(...result.Items);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

function toMongoDoc(table: string, item: Record<string, unknown>) {
  if (COMPOSITE_KEY_TABLES[table]) {
    const { pk, sk } = COMPOSITE_KEY_TABLES[table];
    // Generate _id from composite key, keep original fields
    const _id = `${item[pk]}#${item[sk]}`;
    return { _id, ...item };
  }
  // Standard table: rename id → _id
  const { id, ...rest } = item;
  return { _id: id, ...rest };
}

async function main() {
  const dynamoClient = new DynamoDBClient({
    region: "eu-central-1",
    endpoint: process.env.DYNAMODB_ENDPOINT || "http://localhost:8000",
  });
  const ddb = DynamoDBDocumentClient.from(dynamoClient);

  const mongo = new MongoClient(
    process.env.MONGODB_URI || "mongodb://localhost:27017"
  );
  await mongo.connect();
  const db = mongo.db("aijourney");

  for (const table of TABLES) {
    const items = await scanAll(ddb, table);
    if (items.length === 0) {
      console.log(`  ○ ${table}: empty, skipped`);
      continue;
    }

    const docs = items.map((item) => toMongoDoc(table, item));
    const collection = db.collection(table);

    // Drop existing data in collection (idempotent re-run)
    await collection.deleteMany({});
    await collection.insertMany(docs);
    console.log(`  ✓ ${table}: ${docs.length} documents migrated`);
  }

  await mongo.close();
  dynamoClient.destroy();
  console.log("Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

### 7.3 Seed Data Script

Replace `scripts/seed-db.ts` with a MongoDB version that creates indexes and optionally inserts seed data:

```typescript
#!/usr/bin/env tsx
/**
 * Creates collections, indexes, and optional seed data in MongoDB.
 * Usage: MONGODB_URI=mongodb://localhost:27017 npx tsx scripts/seed-db.ts
 */
import { MongoClient } from "mongodb";

async function main() {
  const client = new MongoClient(
    process.env.MONGODB_URI || "mongodb://localhost:27017"
  );
  await client.connect();
  const db = client.db("aijourney");

  // Create indexes (idempotent — createIndex is a no-op if index exists)
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("journeys").createIndex({ userId: 1, createdAt: -1 });
  await db.collection("steps").createIndex({ journeyId: 1, order: 1 });
  await db.collection("kpis").createIndex({ stepId: 1 });
  await db.collection("evidence").createIndex({ kpiId: 1, submittedAt: -1 });
  await db.collection("run_requests").createIndex({ userId: 1, status: 1 });
  await db.collection("run_requests").createIndex({ status: 1, createdAt: -1 });
  await db.collection("run_logs").createIndex(
    { runRequestId: 1, timestamp: 1 }, { unique: true }
  );
  await db.collection("agent_runs").createIndex({ agent: 1, createdAt: -1 });
  await db.collection("agent_runs").createIndex({ status: 1, createdAt: -1 });
  await db.collection("articles").createIndex({ status: 1, fetchedAt: -1 });
  await db.collection("articles").createIndex({ url: 1 }, { unique: true });
  await db.collection("summaries").createIndex({ articleId: 1 });
  await db.collection("events").createIndex({ userId: 1, timestamp: -1 });

  console.log("✓ All indexes ensured");

  // Seed data (if needed, port from existing seed-db.ts)
  // ...

  await client.close();
}

main().catch(console.error);
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

Each repository test file needs updating to use MongoDB instead of DynamoDB:

**Test Setup Pattern:**
```typescript
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod: MongoMemoryServer;
let db: Db;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const client = new MongoClient(mongod.getUri());
  await client.connect();
  db = client.db("test");
});

afterAll(async () => {
  await mongod.stop();
});

beforeEach(async () => {
  // Clear all collections between tests
  const collections = await db.listCollections().toArray();
  for (const col of collections) {
    await db.collection(col.name).deleteMany({});
  }
});
```

**Dev dependency to add:**
```bash
pnpm add -D mongodb-memory-server  # In-memory MongoDB for tests
```

### 8.2 Integration Tests

- Run against the Docker MongoDB instance (`docker compose up mongodb`)
- Verify all indexes are created correctly
- Test concurrent writes (MongoDB handles this differently than DynamoDB's conditional expressions)

### 8.3 Conditional Expression Migration

DynamoDB `ConditionExpression: "attribute_not_exists(id)"` (used in create operations to prevent overwrites) needs explicit handling in MongoDB:

```typescript
// DynamoDB pattern:
await ddb.send(new PutCommand({
  TableName: TABLE,
  Item: user,
  ConditionExpression: "attribute_not_exists(id)",  // Reject if exists
}));

// MongoDB equivalent:
try {
  await collection.insertOne(toMongoDoc(user));
} catch (err) {
  if (err.code === 11000) {  // Duplicate key error
    throw new ConflictError(`Document already exists: ${user.id}`);
  }
  throw err;
}
```

Since `_id` has a unique index by default, `insertOne` will throw error code `11000` on duplicate, providing the same guarantee.

### 8.4 Validation Checklist

| Test | Command | Expected |
|---|---|---|
| API health check | `curl https://ai.1p.hu/api/health` | `{ "status": "ok", "mongodb": "connected" }` |
| User login (Cognito SSO) | Browser → Google login | User created/updated in MongoDB |
| Journey listing | `/api/journeys` | Returns user's journeys sorted by createdAt desc |
| KB Builder crawl | Trigger via admin UI | Articles + summaries written to MongoDB |
| Agent run logging | Any LLM operation | Agent run recorded in `agent_runs` collection |
| Run request flow | Create + approve + execute | Full state machine works |

---

## 9. Rollout Plan

### Phase 0: Preparation (before any code changes)

1. **Snapshot current DynamoDB data** — `docker exec` into the container and copy the data directory, or run the migration script to export all data as JSON backup
2. **Create feature branch**: `feat/mongodb-migration`
3. **Install MongoDB locally**: `docker run -d -p 27017:27017 --name mongo-dev mongo:8`

### Phase 1: Add MongoDB Infrastructure (no code changes to repositories)

1. Add MongoDB to `docker-compose.yml` (local dev) and `docker-compose.server.yml` (prod)
2. Create `scripts/mongo-init.js` with all indexes
3. Add `MONGODB_URI` env var to `.env.example` and all service configs
4. Add `mongodb` package dependency
5. **Test**: `docker compose up mongodb` — verify it starts and indexes are created

### Phase 2: Rewrite API Service Repositories

1. Create `services/api/src/mongodb/mongodb.module.ts`
2. Add `MONGODB_URI` to `AppConfigService`
3. Create `id` ↔ `_id` mapping helpers
4. Rewrite repositories one at a time:
   - `users.repository.ts` (simplest — start here)
   - `journeys.repository.ts`
   - `runs.repository.ts`
   - `agent-runs.repository.ts`
5. Update `health.service.ts`
6. Replace `DynamoDBModule` with `MongoDBModule` in `app.module.ts`
7. **Test**: Run full API test suite

### Phase 3: Rewrite KB Builder Repositories

1. Create `services/kb-builder/src/db.ts` (MongoDB connection)
2. Rewrite repositories:
   - `article-repository.ts`
   - `summary-repository.ts`
   - `agent-run-logger.ts`
3. Update KB Builder startup to call `initDb()`
4. **Test**: Run KB Builder test suite

### Phase 4: Scripts & Cleanup

1. Rewrite `scripts/seed-db.ts` for MongoDB
2. Replace `scripts/create-prod-tables.ts` with `scripts/mongo-init.js` (or keep as separate TS script)
3. Update Dockerfile seed target to use MongoDB
4. Remove DynamoDB-specific services from Docker Compose (dynamodb-local, seed-db)
5. Remove `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` from package.json files (verify no other services need them)

### Phase 5: Data Migration & Production Deploy

1. Run the migration script against production (DynamoDB Local → MongoDB)
   ```bash
   ssh root@51.15.108.144
   cd /opt/aijourney
   # Start MongoDB alongside DynamoDB (temporarily both running)
   docker compose -f docker-compose.server.yml up -d mongodb
   # Run migration
   docker compose -f docker-compose.server.yml run --rm api \
     npx tsx scripts/migrate-dynamo-to-mongo.ts
   ```
2. Verify migrated data: `docker exec -it <mongo-container> mongosh aijourney --eval "db.stats()"`
3. Deploy the new code: `docker compose -f docker-compose.server.yml up -d --build`
4. Verify all services are healthy
5. Keep DynamoDB container stopped (not removed) for 1 week as safety net
6. After 1 week: Remove DynamoDB container and volume

### Phase 6: Update Documentation

1. Update `AGENTS.md` — replace all DynamoDB references with MongoDB
2. Update `IMPLEMENTATION_PLAN.md` — update tech stack section
3. Update `docker-compose` comments
4. Update `.env.example`
5. Update `guides/` if any reference DynamoDB directly

---

## 10. Rollback Strategy

If the migration fails or introduces critical issues:

### Quick Rollback (< 5 minutes)

1. `git revert` the migration commit(s) on `main`
2. `docker compose -f docker-compose.server.yml up -d --build`
3. DynamoDB data volume is preserved (we only stopped, not removed the container)

### Data Rollback

The DynamoDB volume (`dynamodb_data`) remains intact until explicitly removed. To restore:
```bash
docker compose -f docker-compose.server.yml up -d dynamodb-local seed-db
```

### Safety Measures

- Keep `dynamodb_data` volume for at least 1 week post-migration
- Export all DynamoDB data as JSON before migration (backup)
- Tag the last DynamoDB commit for easy `git checkout`

---

## 11. Post-Migration Cleanup

### Remove AWS DynamoDB Dependencies

```bash
# Check which packages still need @aws-sdk/client-dynamodb
grep -r "@aws-sdk/client-dynamodb" --include="package.json" .
grep -r "@aws-sdk/lib-dynamodb" --include="package.json" .

# Remove from each package that no longer needs it
cd services/api && pnpm remove @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
cd services/kb-builder && pnpm remove @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

> **Warning**: Keep `@aws-sdk/client-dynamodb` if other scripts still reference it. The root `scripts/create-prod-tables.ts` can be deleted entirely.

### Files to Delete

| File | Reason |
|---|---|
| `services/api/src/dynamodb/dynamodb.module.ts` | Replaced by `mongodb/mongodb.module.ts` |
| `scripts/create-prod-tables.ts` | Replaced by `scripts/mongo-init.js` |
| Old `scripts/seed-db.ts` | Replaced by new MongoDB version |

### Configuration Cleanup

| Config Entry | Action |
|---|---|
| `DYNAMODB_ENDPOINT` | Remove from all `.env`, Docker Compose, and config schemas |
| `MONGODB_URI` | Add to all `.env`, Docker Compose, and config schemas |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in dynamodb contexts | Remove from `dynamodb-local` and `seed-db` |

### Docker Volume Cleanup

After confirming MongoDB is stable (1+ week):

```bash
# On the Scaleway server
docker volume rm aijourney_dynamodb_data
```

---

## Appendix A: Quick Reference — DynamoDB vs MongoDB Commands

| Operation | DynamoDB (current) | MongoDB (target) |
|---|---|---|
| Insert | `PutCommand({ TableName, Item, ConditionExpression })` | `collection.insertOne(doc)` |
| Get by PK | `GetCommand({ TableName, Key: { id } })` | `collection.findOne({ _id: id })` |
| Query by index | `QueryCommand({ IndexName, KeyConditionExpression, ExpressionAttributeValues })` | `collection.find({ field: value }).sort({ field: -1 })` |
| Full scan | `ScanCommand({ TableName, Limit })` | `collection.find({}).limit(n).toArray()` |
| Scan + filter | `ScanCommand({ FilterExpression, ExpressionAttributeNames, ExpressionAttributeValues })` | `collection.findOne({ field: value })` |
| Update | `UpdateCommand({ Key, UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues })` | `collection.updateOne({ _id: id }, { $set: updates })` |
| Delete | `DeleteCommand({ Key: { id } })` | `collection.deleteOne({ _id: id })` |
| Count | `ScanCommand({ Select: "COUNT" })` | `collection.countDocuments({})` |
| Health check | `ScanCommand({ TableName, Limit: 1 })` | `db.command({ ping: 1 })` |

## Appendix B: Potential Future Optimizations (Post-Migration)

Once on MongoDB, these improvements become available but are **not part of this migration**:

1. **Embed Steps inside Journeys** — Steps are always queried by journeyId; embedding eliminates a join/lookup
2. **Embed KPIs inside Steps** — Same reasoning; 1:few relationship
3. **Text search on Articles** — MongoDB Atlas Search or `$text` index for full-text search
4. **Aggregation pipelines** — Replace multiple queries with single aggregations (e.g., journey progress dashboard)
5. **Change streams** — Replace BullMQ polling with MongoDB change streams for real-time updates
6. **TTL indexes** — Auto-expire old events/logs: `db.events.createIndex({ timestamp: 1 }, { expireAfterSeconds: 7776000 })` (90 days)
7. **Transactions** — Multi-document ACID transactions for complex state changes (e.g., run request approval + log creation)
