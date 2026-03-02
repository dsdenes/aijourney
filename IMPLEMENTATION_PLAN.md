# AI Journey Platform — Detailed Implementation Plan

> **Project**: Personalized AI Experimentation Journey for Mito.hu employees
> **Created**: 2026-02-20
> **Status**: Planning
> **Variant**: MVP (single environment, cost-optimized)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Repository Structure](#3-repository-structure)
4. [Data Model & Schemas](#4-data-model--schemas)
5. [Workstream A — Product & Journey Design](#5-workstream-a--product--journey-design)
6. [Workstream B — SSO & Web App (Svelte)](#6-workstream-b--sso--web-app-svelte)
7. [Workstream C — Core Backend API (Node.js)](#7-workstream-c--core-backend-api-nodejs)
8. [Workstream D — Knowledge Base Builder](#8-workstream-d--knowledge-base-builder)
9. [Workstream E — Personalization Agent](#9-workstream-e--personalization-agent)
10. [Workstream F — Platform / Infra / DevEx](#10-workstream-f--platform--infra--devex)
11. [Manual Start/Stop LLM Control System](#11-manual-startstop-llm-control-system)
12. [Milestone Plan & Exit Criteria](#12-milestone-plan--exit-criteria)
13. [KPI Framework](#13-kpi-framework)
14. [GitLab CI/CD Pipeline](#14-gitlab-cicd-pipeline)
15. [Terraform Provisioning](#15-terraform-provisioning)
16. [Risk Register & Mitigations](#16-risk-register--mitigations)
17. [Immediate Next Actions](#17-immediate-next-actions)
18. [Appendix — Epic & Issue Breakdown](#18-appendix--epic--issue-breakdown)

---

## 1. Executive Summary

### Goal

Deliver a Svelte website where **mito.hu** employees log in via Google Workspace SSO and receive a **personalized, measurable AI experimentation journey** — explicit steps with KPIs, evidence collection, and progress tracking.

### MVP Principles

This plan targets a **single MVP environment** with cost-optimized infrastructure. There are no separate dev/stage/prod environments — just one deployed stack in AWS, plus local development via Docker Compose. The infrastructure choices (DynamoDB on-demand, smallest ElastiCache node, minimal Fargate tasks, no NAT Gateway) keep the monthly AWS bill under ~$60 excluding LLM API costs.

### Non-Negotiables

| # | Constraint | Enforcement Mechanism |
|---|---|---|
| 1 | Google Workspace SSO restricted to `mito.hu` domain | Amazon Cognito federation + app-level domain check |
| 2 | All LLM runs are manually started/stopped | RunRequest → Approval → Execution state machine |
| 3 | Measurable journeys with KPIs | Per-step outcome rubrics, journey progress %, org-level dashboards |
| 4 | No unattended background LLM execution | Concurrency caps, per-run token/time budgets, audit logs |
| 5 | Cost governance | Per-run budgets, daily cost alarms, model routing rules |

### Two Backend Subsystems

1. **Knowledge Base Builder** — Curated web crawl → LLM summary → Amazon Bedrock Knowledge Bases → "NotebookLM-like" single-input chat UI.
2. **Personalization Agent** — Employee job description + user details → RAG-powered measurable journey generation.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (Svelte/SvelteKit)                    │
│                                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │  Login/   │ │Onboarding│ │ Journey  │ │  KB Chat │ │    Admin     │ │
│  │   SSO     │ │  Intake  │ │Dashboard │ │    UI    │ │   Console    │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ HTTPS (REST/JSON)
┌────────────────────────────▼────────────────────────────────────────────┐
│                        BACKEND (Node.js)                                │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────────┐  ┌────────────────────┐  │
│  │   API Service    │  │ Orchestration Svc   │  │  KB Builder Svc    │  │
│  │                  │  │                     │  │                    │  │
│  │ • Auth/Session   │  │ • BullMQ Queues     │  │ • Crawler          │  │
│  │ • User Profiles  │  │ • Run Approval Gate │  │ • Extractor        │  │
│  │ • Journey CRUD   │  │ • Execution Engine  │  │ • Deduplicator     │  │
│  │ • KPI/Evidence   │  │ • Cancel Handler    │  │ • Quality Filter   │  │
│  │ • Admin Controls │  │ • Audit Logger      │  │ • Summarizer       │  │
│  │ • Run Requests   │  │ • Budget Enforcer   │  │ • Bedrock Ingestor │  │
│  └────────┬─────────┘  └─────────┬───────────┘  └────────┬───────────┘  │
└───────────┼──────────────────────┼───────────────────────┼──────────────┘
            │                      │                       │
┌───────────▼──────────────────────▼───────────────────────▼──────────────┐
│                           DATA LAYER                                    │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ ┌────────────────┐  │
│  │  DynamoDB     │  │ ElastiCache  │  │    S3    │ │  Bedrock KB    │  │
│  │              │  │  (Redis)     │  │          │ │                │  │
│  │ • users      │  │ • queues     │  │ • raw    │ │ • vector store │  │
│  │ • journeys   │  │ • locks      │  │   HTML   │ │ • retrieval    │  │
│  │ • steps      │  │ • rate       │  │ • text   │ │ • embeddings   │  │
│  │ • kpis       │  │   limits     │  │ • assets │ │                │  │
│  │ • evidence   │  │ • run        │  │          │ │                │  │
│  │ • run_reqs   │  │   state      │  │          │ │                │  │
│  │ • run_logs   │  │              │  │          │ │                │  │
│  │ • articles   │  │              │  │          │ │                │  │
│  │ • summaries  │  │              │  │          │ │                │  │
│  │ • events     │  │              │  │          │ │                │  │
│  └──────────────┘  └──────────────┘  └──────────┘ └────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────┐
│                       AWS MANAGED SERVICES                              │
│                                                                         │
│  • Amazon DynamoDB   — Primary database (on-demand, pay-per-request)    │
│  • Amazon ElastiCache — Redis-compatible cache/queue (BullMQ, locks)    │
│  • Amazon Cognito    — Google SSO federation (mito.hu domain lock)      │
│  • Amazon S3         — Raw snapshots, artifacts, evidence files         │
│  • Amazon Bedrock KB — RAG storage + retrieval                          │
│  • AWS Secrets Mgr   — OpenAI keys, API tokens                         │
│  • Amazon CloudWatch — Logs, metrics, alarms                            │
│  • AWS ECS/Fargate   — Container compute for API + workers              │
│  • Terraform         — All provisioning as code                         │
└─────────────────────────────────────────────────────────────────────────┘

LLM PROVIDERS (external):
  • OpenAI API — Summarization (KB pipeline) + Personalization (journey gen)
  • Bedrock model (configurable) — Alternative for KB chat generation

MVP cost strategy:
  • DynamoDB on-demand — free tier covers 25 GB + 25 WCU/RCU; pay per request beyond
  • ElastiCache cache.t3.micro — single node, ~$12/month
  • ECS Fargate — minimal task sizes (0.25 vCPU / 0.5 GB RAM)
  • No NAT Gateway — ECS tasks in public subnets + VPC endpoints for AWS services
  • No WAF — defer to post-MVP hardening
  • Single AZ — acceptable for MVP
  • CloudFront — free tier covers initial usage
```

### Communication Patterns

| Source | Target | Protocol | Auth |
|---|---|---|---|
| Svelte frontend | API Service | HTTPS REST | Cognito JWT |
| API Service | Orchestration Svc | BullMQ (ElastiCache Redis) | Internal network |
| Orchestration Svc | OpenAI | HTTPS | API key (Secrets Manager) |
| Orchestration Svc | Bedrock KB | AWS SDK | IAM task role |
| KB Builder Svc | Crawler targets | HTTPS | N/A (public) |
| KB Builder Svc | S3 | AWS SDK | IAM task role |
| KB Builder Svc | Bedrock KB Ingest | AWS SDK | IAM task role |
| All services | DynamoDB | AWS SDK (HTTPS) | IAM task role |
| All services | ElastiCache | Redis protocol | Auth token (Secrets Manager) |

---

## 3. Repository Structure

```
aijourney/
├── .gitlab-ci.yml                    # Root CI/CD pipeline
├── .gitignore
├── README.md
├── IMPLEMENTATION_PLAN.md            # This file
│
├── apps/
│   └── web/                          # Svelte/SvelteKit frontend
│       ├── package.json
│       ├── svelte.config.js
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── src/
│       │   ├── app.html
│       │   ├── app.css
│       │   ├── lib/
│       │   │   ├── components/       # Reusable Svelte components
│       │   │   │   ├── auth/         # Login, SSO redirect
│       │   │   │   ├── journey/      # Journey cards, step views, progress
│       │   │   │   ├── kpi/          # KPI widgets, charts, evidence upload
│       │   │   │   ├── kb/           # KB chat UI, citation display
│       │   │   │   ├── admin/        # Admin panels, run queue, approvals
│       │   │   │   └── shared/       # Buttons, modals, layouts
│       │   │   ├── stores/           # Svelte stores + runes (auth, journey, ui)
│       │   │   ├── api/              # API client functions
│       │   │   └── utils/            # Formatters, validators
│       │   └── routes/
│       │       ├── +layout.svelte    # Root layout with nav
│       │       ├── +page.svelte      # Landing / redirect
│       │       ├── login/
│       │       ├── onboarding/
│       │       ├── dashboard/
│       │       ├── journey/[id]/
│       │       ├── kb/
│       │       ├── profile/
│       │       └── admin/
│       │           ├── runs/
│       │           ├── ingestion/
│       │           └── users/
│       ├── static/
│       └── tests/
│
├── services/
│   ├── api/                          # NestJS backend API
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── nest-cli.json             # NestJS CLI config
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   ├── main.ts               # NestJS bootstrap entrypoint
│   │   │   ├── app.module.ts         # Root application module
│   │   │   ├── config/
│   │   │   │   └── config.module.ts   # Typed env config (Zod-validated)
│   │   │   ├── auth/
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── jwt.strategy.ts    # Passport JWT strategy (Cognito)
│   │   │   │   ├── domain.guard.ts    # @mito.hu domain check
│   │   │   │   └── roles.guard.ts     # RBAC via @Roles() decorator
│   │   │   ├── users/
│   │   │   │   ├── users.module.ts
│   │   │   │   ├── users.controller.ts
│   │   │   │   ├── users.service.ts
│   │   │   │   └── users.repository.ts
│   │   │   ├── journeys/              # Journey + steps CRUD
│   │   │   ├── kpis/                  # KPI definitions + measurements
│   │   │   ├── evidence/              # Evidence upload (S3)
│   │   │   ├── runs/                  # RunRequest state machine
│   │   │   ├── kb/                    # KB chat endpoints
│   │   │   ├── admin/                 # Admin-only endpoints
│   │   │   ├── events/                # Event tracking
│   │   │   ├── health/                # Health + readiness checks
│   │   │   ├── common/
│   │   │   │   ├── filters/           # Global exception filter
│   │   │   │   ├── interceptors/      # RequestId, OTel span, logging
│   │   │   │   ├── pipes/             # Zod validation pipe
│   │   │   │   └── decorators/        # @Roles(), @CurrentUser(), etc.
│   │   │   ├── repositories/          # DynamoDB data access (injectable)
│   │   │   └── telemetry/
│   │   │       └── otel.module.ts     # OpenTelemetry SDK setup
│   │   └── tests/
│   │
│   ├── worker/                       # Orchestration service (BullMQ workers)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── queues/
│   │   │   │   ├── summarization.queue.ts
│   │   │   │   ├── personalization.queue.ts
│   │   │   │   └── kb-chat.queue.ts
│   │   │   ├── workers/
│   │   │   │   ├── summarization.worker.ts
│   │   │   │   ├── personalization.worker.ts
│   │   │   │   └── kb-chat.worker.ts
│   │   │   ├── gates/
│   │   │   │   ├── approval.gate.ts
│   │   │   │   └── budget.gate.ts
│   │   │   ├── executors/
│   │   │   │   ├── openai.executor.ts
│   │   │   │   └── bedrock.executor.ts
│   │   │   ├── audit/
│   │   │   │   └── logger.ts
│   │   │   └── utils/
│   │   │       ├── cancel-checker.ts
│   │   │       └── token-counter.ts
│   │   └── tests/
│   │
│   └── kb-builder/                   # Knowledge base builder service
│       ├── package.json
│       ├── tsconfig.json
│       ├── Dockerfile
│       ├── src/
│       │   ├── index.ts
│       │   ├── pipeline/
│       │   │   ├── orchestrator.ts    # Pipeline coordination
│       │   │   ├── crawler.ts         # HTTP fetch from seed URLs
│       │   │   ├── extractor.ts       # Readability parse, boilerplate removal
│       │   │   ├── deduplicator.ts    # Hash + similarity dedup
│       │   │   ├── quality-filter.ts  # Allowlist, recency, length, relevance
│       │   │   ├── summarizer.ts      # OpenAI summarization calls
│       │   │   ├── ingestor.ts        # Bedrock KB ingestion
│       │   │   └── s3-storage.ts      # Raw HTML/text archival
│       │   ├── seeds/
│       │   │   └── default-seeds.json # Initial URL allowlist
│       │   ├── prompts/
│       │   │   └── summarize.ts       # Summarization prompt templates
│       │   └── utils/
│       └── tests/
│
├── packages/
│   └── shared/                       # Shared types, schemas, utilities
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── types/
│       │   │   ├── user.ts
│       │   │   ├── journey.ts
│       │   │   ├── step.ts
│       │   │   ├── kpi.ts
│       │   │   ├── evidence.ts
│       │   │   ├── run-request.ts
│       │   │   ├── run-log.ts
│       │   │   ├── article.ts
│       │   │   └── summary.ts
│       │   ├── schemas/              # Zod validation schemas
│       │   ├── constants/
│       │   │   ├── roles.ts
│       │   │   ├── run-states.ts
│       │   │   └── journey-levels.ts
│       │   └── utils/
│       └── tests/
│
├── infra/
│   └── terraform/
│       ├── modules/
│       │   ├── networking/           # VPC, subnets, IGW (no NAT for MVP)
│       │   ├── security/             # IAM, security groups
│       │   ├── compute/              # ECS/Fargate task definitions
│       │   ├── data/                 # DynamoDB tables, ElastiCache, S3
│       │   ├── cognito/              # User pool, Google IdP, domain restriction
│       │   ├── bedrock/              # KB resources, data source configs
│       │   └── observability/        # CloudWatch logs, basic alarms
│       ├── main.tf                   # Root module composing all modules
│       ├── variables.tf
│       ├── outputs.tf
│       ├── terraform.tfvars          # MVP environment values
│       └── backend.tf                # S3 state backend config
│
├── docs/
│   ├── architecture-decision-records/
│   │   ├── 001-svelte-frontend.md
│   │   ├── 002-manual-llm-control.md
│   │   ├── 003-bedrock-kb-choice.md
│   │   └── 004-auth-cognito-sso.md
│   ├── journey-framework.md
│   ├── api-spec.yaml                 # OpenAPI 3.1 specification
│   ├── runbooks/
│   │   ├── deploy-rollback.md
│   │   ├── incident-basics.md
│   │   └── cost-controls.md
│   └── wireframes/
│
└── scripts/
    ├── seed-db.ts                    # Seed baseline journeys
    ├── seed-kb.ts                    # Seed initial KB articles
    └── dev-setup.sh                  # Local dev environment setup
```

---

## 4. Data Model & Schemas

### 4.1 DynamoDB Tables

All tables use **on-demand billing** (pay-per-request) — ideal for MVP with unpredictable/low traffic. IDs use [ULID](https://github.com/ulid/spec) (time-sortable, URL-safe, 26 chars). Timestamps are ISO 8601 strings.

#### `users`

| Key | Attribute | Type |
|---|---|---|
| **PK** | `id` | String (ULID) |

```typescript
interface User {
  id: string;                    // ULID
  googleId: string;              // Google Workspace unique ID
  email: string;                 // Must end with @mito.hu
  name: string;
  avatarUrl?: string;
  role: 'employee' | 'admin';
  department?: string;
  jobTitle?: string;
  jobDescription?: string;       // Free-text from onboarding
  onboardingComplete: boolean;
  preferences: {
    tools?: string[];            // Tools they use
    workflows?: string[];        // Key workflows
    comfortLevel?: 'beginner' | 'intermediate' | 'advanced';
    goals?: string[];
  };
  createdAt: string;             // ISO 8601
  updatedAt: string;
  lastLoginAt: string;
}
```

**GSIs**:
- `email-index`: PK=`email` — unique lookup by email
- `googleId-index`: PK=`googleId` — unique lookup by Google ID

#### `journeys`

| Key | Attribute | Type |
|---|---|---|
| **PK** | `id` | String (ULID) |

```typescript
interface Journey {
  id: string;                    // ULID
  userId: string;                // FK → users.id
  version: number;               // Incremented on regeneration
  title: string;
  description: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  currentLevel: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
  competencyAreas: string[];
  generatedBy: {
    runRequestId: string;        // FK → run_requests.id
    model: string;
    promptVersion: string;
  };
  metadata: {
    estimatedDurationWeeks: number;
    difficultyProgression: string;
    roleCategory: string;        // engineering, PM, design, HR, finance, sales
  };
  createdAt: string;
  updatedAt: string;
}
```

**GSIs**:
- `userId-status-index`: PK=`userId`, SK=`status` — list journeys by user and status
- `userId-createdAt-index`: PK=`userId`, SK=`createdAt` — list journeys by user chronologically

#### `steps`

| Key | Attribute | Type |
|---|---|---|
| **PK** | `journeyId` | String (ULID) |
| **SK** | `id` | String (ULID) |

Steps use the journey as PK to enable efficient `Query` for all steps in a journey.

```typescript
interface Step {
  id: string;                    // ULID
  journeyId: string;             // PK — FK → journeys.id
  level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
  order: number;                 // Within level
  title: string;
  description: string;
  task: string;                  // What the user should do
  expectedOutput: string;        // What "done" looks like
  evidenceType: 'file' | 'screenshot' | 'url' | 'text' | 'metric';
  kpiTargets: {
    kpiId: string;
    targetValue: number | string;
    targetUnit: string;
  }[];
  reviewMethod: 'self' | 'peer' | 'manager' | 'auto';
  tags: string[];
  toolsRequired?: string[];
  estimatedMinutes?: number;
  status: 'locked' | 'available' | 'in_progress' | 'submitted' | 'reviewed' | 'completed';
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

**GSIs**:
- `journeyId-level-order-index`: PK=`journeyId`, SK=`level#order` (composite sort key) — ordered step listing

#### `kpis`

| Key | Attribute | Type |
|---|---|---|
| **PK** | `id` | String (ULID) |

```typescript
interface KPI {
  id: string;                    // ULID
  name: string;                  // e.g., "Output Quality Score"
  description: string;
  category: 'step_outcome' | 'journey_progress' | 'org_level';
  measurementType: 'numeric' | 'percentage' | 'boolean' | 'rubric';
  rubricLevels?: {
    score: number;
    label: string;
    description: string;
  }[];
  unit?: string;
  direction: 'higher_is_better' | 'lower_is_better' | 'target';
  targetValue?: number;
  isGlobal: boolean;             // true = org-level standard KPI
  createdAt: string;
}
```

**GSIs**:
- `category-index`: PK=`category` — list KPIs by category
- `isGlobal-index`: PK=`isGlobal` — list global KPIs

#### `evidence`

| Key | Attribute | Type |
|---|---|---|
| **PK** | `stepId` | String (ULID) |
| **SK** | `id` | String (ULID) |

```typescript
interface Evidence {
  id: string;                    // ULID
  stepId: string;                // PK — FK → steps.id
  userId: string;
  type: 'file' | 'screenshot' | 'url' | 'text' | 'metric';
  content: {
    s3Key?: string;              // For file/screenshot uploads
    url?: string;
    text?: string;
    metricValue?: number;
    metricUnit?: string;
  };
  kpiMeasurements: {
    kpiId: string;
    value: number | string;
    measuredAt: string;
    source: 'self_report' | 'peer_review' | 'auto';
  }[];
  reviewStatus: 'pending' | 'accepted' | 'rejected';
  reviewNotes?: string;
  reviewedBy?: string;
  submittedAt: string;
  reviewedAt?: string;
}
```

**GSIs**:
- `userId-submittedAt-index`: PK=`userId`, SK=`submittedAt` — user's evidence timeline
- `reviewStatus-index`: PK=`reviewStatus` — list pending reviews

#### `run_requests`

| Key | Attribute | Type |
|---|---|---|
| **PK** | `id` | String (ULID) |

```typescript
interface RunRequest {
  id: string;                    // ULID
  userId: string;                // Who initiated
  purpose: 'summarization' | 'personalization' | 'kb_chat' | 'kb_ingestion';
  status: 'PENDING' | 'APPROVED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
        | 'CANCEL_REQUESTED' | 'CANCELLED' | 'REJECTED';
  inputs: {
    prompt?: string;             // Hashed or redacted for audit
    promptHash: string;
    context?: Record<string, unknown>;
    sourceDocIds?: string[];
  };
  budget: {
    maxTokens: number;
    maxDurationMs: number;
    estimatedCostUsd: number;
  };
  approval: {
    requiredApproval: boolean;
    approvedBy?: string;
    approvedAt?: string;
    autoApproved: boolean;
  };
  execution?: {
    startedAt: string;
    completedAt?: string;
    actualTokensUsed: number;
    actualDurationMs: number;
    actualCostUsd: number;
    model: string;
    modelVersion: string;
    outputRef?: string;
    error?: string;
  };
  cancelledBy?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

**GSIs**:
- `userId-status-index`: PK=`userId`, SK=`status` — user's runs by status
- `status-createdAt-index`: PK=`status`, SK=`createdAt` — admin queue view
- `purpose-status-index`: PK=`purpose`, SK=`status` — runs by type

#### `run_logs`

| Key | Attribute | Type |
|---|---|---|
| **PK** | `runRequestId` | String (ULID) |
| **SK** | `timestamp` | String (ISO 8601) |

Immutable append-only table — no updates or deletes.

```typescript
interface RunLog {
  runRequestId: string;          // PK
  timestamp: string;             // SK (ISO 8601)
  event: 'created' | 'approved' | 'rejected' | 'started' | 'progress'
       | 'cancel_requested' | 'cancelled' | 'completed' | 'failed'
       | 'budget_warning' | 'budget_exceeded';
  actor: {
    userId?: string;
    system?: string;             // 'worker', 'budget-enforcer', etc.
  };
  details: Record<string, unknown>;
  tokensUsedSoFar?: number;
  costSoFar?: number;
}
```

No GSIs needed — always queried by `runRequestId` with timestamp range.

#### `articles`

| Key | Attribute | Type |
|---|---|---|
| **PK** | `id` | String (ULID) |

```typescript
interface Article {
  id: string;                    // ULID
  url: string;                   // Canonical URL
  title: string;
  source: string;                // Domain or author attribution
  fetchedAt: string;
  contentHash: string;           // SHA-256 of extracted text
  s3Key: string;                 // Raw HTML/text in S3
  status: 'fetched' | 'extracted' | 'deduped' | 'quality_passed'
        | 'quality_failed' | 'summarized' | 'ingested' | 'rejected';
  qualityScore?: number;
  metadata: {
    publishedAt?: string;
    author?: string;
    wordCount: number;
    language: string;
    tags?: string[];
  };
  dedupe: {
    isDuplicate: boolean;
    similarTo?: string;
    similarityScore?: number;
  };
  ingestionRunId?: string;       // FK → run_requests.id
  createdAt: string;
  updatedAt: string;
}
```

**GSIs**:
- `url-index`: PK=`url` — unique lookup by URL
- `status-index`: PK=`status` — list articles in pipeline stage
- `contentHash-index`: PK=`contentHash` — deduplication lookup

#### `summaries`

| Key | Attribute | Type |
|---|---|---|
| **PK** | `articleId` | String (ULID) |
| **SK** | `id` | String (ULID) |

```typescript
interface Summary {
  id: string;                    // ULID
  articleId: string;             // PK — FK → articles.id
  runRequestId: string;
  version: number;
  content: {
    title: string;
    keyPoints: string[];
    dos: string[];               // Best practices
    donts: string[];             // Anti-patterns
    tags: string[];
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    roleRelevance: {
      role: string;
      relevanceScore: number;
    }[];
    citations: {
      text: string;
      sourceSection: string;
    }[];
  };
  bedrockKbDocId?: string;
  model: string;
  promptVersion: string;
  tokensUsed: number;
  createdAt: string;
}
```

No additional GSIs needed — always queried by `articleId`.

#### `events`

| Key | Attribute | Type |
|---|---|---|
| **PK** | `userId` | String (ULID) |
| **SK** | `timestamp#eventId` | String (composite) |

```typescript
interface UserEvent {
  userId: string;                // PK
  timestamp: string;             // Part of SK (ISO 8601)
  eventId: string;               // Part of SK (ULID, for uniqueness)
  event: string;                 // e.g., 'journey.started', 'step.completed', 'kb.query'
  properties: Record<string, unknown>;
  sessionId: string;
}
```

**GSIs**:
- `event-timestamp-index`: PK=`event`, SK=`timestamp` — query events by type across all users

### 4.2 DynamoDB Design Notes

**Single-table vs multi-table**: This plan uses **multi-table** design (one table per entity) for simplicity and developer ergonomics. Single-table design is more efficient for Fargate → DynamoDB queries but significantly harder to maintain. For an MVP with on-demand billing and low traffic, multi-table is the right trade-off.

**Access patterns covered by table + GSI design**:
- Get user by ID, email, or Google ID ✅
- List journeys by user ✅
- Get all steps for a journey (ordered) ✅
- Get evidence for a step ✅
- List run requests by user/status or by status globally ✅
- Get audit log for a run request (time-ordered) ✅
- Lookup article by URL or content hash ✅
- List articles by pipeline status ✅

**DynamoDB limits to watch**:
- Item size max: 400 KB (summaries with long content may need S3 offloading)
- GSI eventual consistency (acceptable for MVP)
- No cross-table transactions (use application-level saga for multi-table writes)

### 4.3 ElastiCache Redis Key Patterns

```
# BullMQ Queues
bull:summarization:*          # Summarization job queue
bull:personalization:*        # Personalization job queue
bull:kb-chat:*                # KB chat job queue
bull:kb-ingestion:*           # KB ingestion job queue

# Rate Limiting
ratelimit:user:{userId}:runs      # Per-user run count (sliding window)
ratelimit:global:runs             # Global concurrent run count

# Locks
lock:run:{runRequestId}           # Distributed lock per run execution
lock:ingestion:pipeline           # Single ingestion pipeline lock

# Run State (for fast status checks — mirrors DynamoDB for low-latency reads)
runstate:{runRequestId}           # Current state + progress
runstate:active:count             # Active run counter

# Session Cache
session:{sessionId}               # Cached session data
```

---

## 5. Workstream A — Product & Journey Design

### 5.1 Journey Taxonomy

#### Levels

| Level | Name | Description | Typical Duration |
|---|---|---|---|
| L0 | Awareness | Understand what AI tools exist, basic concepts | 1–2 weeks |
| L1 | Exploration | Try basic AI tasks with guidance | 2–3 weeks |
| L2 | Integration | Incorporate AI into daily workflows | 3–4 weeks |
| L3 | Optimization | Measure impact, refine techniques, mentor others | 4–6 weeks |
| L4 | Innovation | Design new AI-powered workflows, share org-wide | Ongoing |

#### Competency Areas

| Area | Description | Applicable Roles |
|---|---|---|
| Prompt Engineering | Effective prompt construction and iteration | All |
| Code Generation | Using AI for writing, reviewing, debugging code | Engineering |
| Document Generation | AI-assisted writing, summarization, formatting | All |
| Data Analysis | AI-powered data exploration and insight extraction | PM, Finance, Sales |
| Design Assistance | AI tools for design ideation and iteration | Design |
| Process Automation | Automating repetitive tasks with AI | All |
| Information Synthesis | Using AI to research, summarize, and synthesize | All |
| Critical Evaluation | Assessing AI outputs for accuracy and bias | All |

### 5.2 Step Template

Every step follows a deterministic structure:

```json
{
  "title": "Write your first AI-assisted code review",
  "level": "L1",
  "task": "Use [designated AI tool] to review a pull request. Document the suggestions it made, which you accepted, and which you rejected with reasoning.",
  "expectedOutput": "A written comparison: AI suggestions vs your decisions, with at least 3 accepted and 2 rejected suggestions explained.",
  "evidenceType": "text",
  "kpiTargets": [
    {
      "kpiName": "Output Quality Score",
      "targetValue": 3,
      "targetUnit": "rubric (1-5)"
    },
    {
      "kpiName": "Task Completion",
      "targetValue": true,
      "targetUnit": "boolean"
    }
  ],
  "reviewMethod": "self",
  "estimatedMinutes": 45,
  "tags": ["code-generation", "critical-evaluation"],
  "toolsRequired": ["GitHub Copilot"]
}
```

### 5.3 Deliverables Checklist

- [ ] Journey framework document (competencies × levels matrix)
- [ ] KPI definitions (per-step, journey, org-level) with measurement methods
- [ ] JSON schemas for Journey, Step, KPI, Evidence (Zod + OpenAPI)
- [ ] Baseline journeys for 6 roles: Engineering, PM, Design, HR, Finance, Sales
- [ ] UX wireframes for all major screens
- [ ] Admin authoring model documented (v1: seeded from code, v2: admin UI)

---

## 6. Workstream B — SSO & Web App (Svelte)

### 6.1 Technology Choices

| Decision | Choice | Rationale |
|---|---|---|
| Framework | SvelteKit (Svelte 5) | SSR capability, file-based routing, runes reactivity, excellent DX |
| Rendering | Static + CSR (adapter-static) | Simple hosting on S3/CloudFront; API handles all dynamic data |
| Styling | Tailwind CSS v4 | CSS-first config, `@theme` directive, zero-JS runtime, oxide engine |
| State | Svelte 5 runes ($state, $derived, $effect) | Built-in fine-grained reactivity, replaces stores for component state |
| Auth | Cognito-hosted UI → JWT → API validation | Offload SSO complexity to managed service |
| Charts | Chart.js via svelte-chartjs | KPI progress visualization |
| Stores | Svelte stores (for shared cross-component state) | Native, no extra dependency |
| Testing | Vitest + Playwright | Unit + E2E |

> **Decision needed (Phase 0)**: Static (SPA) vs SSR. Recommendation: start with static/SPA to simplify hosting. Switch to SSR only if SEO or initial load performance requires it.

### 6.2 Routes & Pages

| Route | Page | Auth Required | Role |
|---|---|---|---|
| `/login` | SSO redirect to Cognito | No | — |
| `/callback` | Handle Cognito callback, create session | No | — |
| `/onboarding` | Job description + preferences intake | Yes | Employee |
| `/dashboard` | Journey overview, KPI summary, recent activity | Yes | Employee |
| `/journey/:id` | Journey detail with level tabs and step list | Yes | Employee |
| `/journey/:id/step/:stepId` | Individual step with task, evidence upload, KPI form | Yes | Employee |
| `/kb` | NotebookLM-like chat interface | Yes | Employee |
| `/profile` | Edit profile, view history | Yes | Employee |
| `/admin/runs` | Run queue with approve/reject/stop controls | Yes | Admin |
| `/admin/ingestion` | KB ingestion pipeline control | Yes | Admin |
| `/admin/users` | User list, role management | Yes | Admin |
| `/admin/analytics` | Org-level KPI dashboards | Yes | Admin |

### 6.3 Component Architecture

```
Layout
├── Navbar (role-aware: employee vs admin)
├── Sidebar (journey navigation for employees, admin nav for admins)
└── MainContent
    ├── Pages (route-specific)
    └── Shared Components
        ├── RunControlButton (Start/Stop with state indicator)
        ├── KPIProgressBar
        ├── KPIRadarChart
        ├── EvidenceUploader
        ├── CitationCard
        ├── ChatMessage (for KB UI)
        ├── ChatInput (single input with Run control)
        ├── StepCard
        ├── LevelProgressIndicator
        ├── ApprovalBadge
        └── CostIndicator
```

### 6.4 Auth Flow (Detailed)

```
1. User visits /login
2. Frontend redirects to Cognito Hosted UI
   → Cognito presents Google OAuth consent (restricted to mito.hu)
3. Google authenticates → returns to Cognito callback
4. Cognito validates domain (hosted domain = mito.hu)
   → Issues id_token + access_token + refresh_token
5. Cognito redirects to /callback with auth code
6. Frontend exchanges code for tokens via Cognito token endpoint
7. Frontend stores tokens in httpOnly cookie (via API set-cookie)
8. API validates JWT on every request:
   a. Verify Cognito signature
   b. Check email domain == mito.hu (defense in depth)
   c. Check token expiry
   d. Look up / create user in DynamoDB
   e. Attach user context to request
9. Token refresh: frontend detects 401 → refreshes via Cognito
```

### 6.5 KB Chat UI Design

The KB chat follows a "NotebookLM-like" single-input pattern:

```
┌─────────────────────────────────────────────┐
│                KB Chat                       │
├─────────────────────────────────────────────┤
│                                             │
│  [User message]                             │
│                                             │
│  ┌─ AI Response ──────────────────────────┐ │
│  │ Answer text with inline citations [1]   │ │
│  │ [2] and structured formatting.          │ │
│  │                                         │ │
│  │ ┌─ Sources ──────────────────────────┐  │ │
│  │ │ [1] Article Title — key excerpt     │  │ │
│  │ │ [2] Article Title — key excerpt     │  │ │
│  │ └───────────────────────────────────┘  │ │
│  │                                         │ │
│  │ ⏱ 2.3s · 847 tokens · $0.002          │ │
│  └─────────────────────────────────────────┘ │
│                                             │
│  ┌─────────────────────────────┐ [▶ Start] │
│  │ Ask about AI best practices │            │
│  └─────────────────────────────┘ [■ Stop]  │
└─────────────────────────────────────────────┘
```

Key behaviors:
- **Start** button creates a RunRequest (auto-approved for user's own chat runs).
- **Stop** button sets `CANCEL_REQUESTED` on the RunRequest.
- Token count, duration, and estimated cost shown per response.
- Citations link back to source articles with highlighted excerpts.
- Unsourced claims are explicitly flagged or disallowed.

### 6.6 Deliverables Checklist

- [ ] SvelteKit project scaffold with routing
- [ ] Cognito auth integration (login, callback, session, refresh)
- [ ] Onboarding flow (multi-step form with validation)
- [ ] Journey dashboard with level navigation
- [ ] Step detail page with evidence upload
- [ ] KPI progress widgets and charts
- [ ] KB chat UI with run controls
- [ ] Admin run queue page
- [ ] Admin ingestion control page
- [ ] Admin user management page
- [ ] Role-based navigation and access controls
- [ ] Responsive design (desktop primary, tablet acceptable)
- [ ] Vitest unit tests for stores and API client
- [ ] Playwright E2E tests for critical flows

---

## 7. Workstream C — Core Backend API (Node.js)

### 7.1 Technology Choices

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 24 LTS | Latest LTS, native fetch, performance improvements |
| Framework | NestJS | Modular architecture, built-in DI, guards/interceptors, enterprise patterns |
| Language | TypeScript (strict mode) | Type safety across stack |
| Database | DynamoDB (on-demand) | Fully managed, zero ops, pay-per-request, free tier |
| DB Client | @aws-sdk/lib-dynamodb | Official AWS SDK v3 DynamoDB Document Client |
| Validation | Zod + nestjs-zod | Shared schemas with frontend, excellent TS integration |
| Queue | @nestjs/bullmq (BullMQ 5) | Redis-backed, reliable, good dashboard (Bull Board) |
| Cache/Queue | ElastiCache (Redis) | Managed Redis for BullMQ, rate limits, locks |
| Auth | @nestjs/passport + passport-jwt + jwks-rsa | Validate Cognito JWTs via NestJS guards |
| Observability | @opentelemetry/sdk-node + auto-instrumentations | Distributed tracing, metrics, log correlation |
| Testing | Vitest | Fast, native ESM, compatible with shared package |
| API Docs | @nestjs/swagger | Auto-generated OpenAPI from decorators + Zod schemas |

### 7.2 API Endpoints

#### Auth

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/auth/token` | Exchange Cognito auth code for session | No |
| `POST` | `/api/auth/refresh` | Refresh access token | Cookie |
| `POST` | `/api/auth/logout` | Clear session | Yes |
| `GET` | `/api/auth/me` | Get current user profile | Yes |

#### Users

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/users` | List users (admin) | Admin |
| `GET` | `/api/users/:id` | Get user profile | Owner/Admin |
| `PATCH` | `/api/users/:id` | Update profile / onboarding | Owner/Admin |
| `PATCH` | `/api/users/:id/role` | Change user role | Admin |

#### Journeys

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/journeys` | List user's journeys | Yes |
| `GET` | `/api/journeys/:id` | Get journey with steps | Yes (owner) |
| `POST` | `/api/journeys/generate` | Create RunRequest for journey generation | Yes |
| `PATCH` | `/api/journeys/:id` | Update journey status | Yes (owner) |
| `POST` | `/api/journeys/:id/regenerate` | Create RunRequest for regeneration | Yes (owner) |

#### Steps

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/journeys/:jid/steps` | List steps for journey | Yes (owner) |
| `GET` | `/api/journeys/:jid/steps/:sid` | Get step detail | Yes (owner) |
| `PATCH` | `/api/journeys/:jid/steps/:sid` | Update step status | Yes (owner) |

#### Evidence

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/steps/:sid/evidence` | Submit evidence (multipart) | Yes (owner) |
| `GET` | `/api/steps/:sid/evidence` | List evidence for step | Yes (owner) |
| `PATCH` | `/api/evidence/:eid/review` | Review evidence (peer/admin) | Reviewer |

#### KPIs

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/kpis` | List KPI definitions | Yes |
| `GET` | `/api/users/:id/kpi-summary` | Get user's KPI aggregation | Owner/Admin |
| `GET` | `/api/admin/kpi-dashboard` | Org-level KPI overview | Admin |

#### Run Requests

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/runs` | Create run request | Yes |
| `GET` | `/api/runs` | List user's run requests | Yes |
| `GET` | `/api/runs/:id` | Get run detail + logs | Yes (owner/admin) |
| `POST` | `/api/runs/:id/approve` | Approve run | Admin (or auto) |
| `POST` | `/api/runs/:id/reject` | Reject run | Admin |
| `POST` | `/api/runs/:id/cancel` | Request cancellation | Owner/Admin |
| `GET` | `/api/admin/runs` | List all runs (with filters) | Admin |

#### KB Chat

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/kb/query` | Create KB chat run request | Yes |
| `GET` | `/api/kb/history` | Get user's chat history | Yes |

#### Admin — Ingestion

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/admin/ingestion/candidates` | List crawled article candidates | Admin |
| `POST` | `/api/admin/ingestion/approve` | Approve articles for ingestion | Admin |
| `POST` | `/api/admin/ingestion/start` | Start ingestion pipeline run | Admin |
| `POST` | `/api/admin/ingestion/stop` | Stop ingestion pipeline | Admin |
| `GET` | `/api/admin/ingestion/status` | Pipeline status | Admin |

### 7.3 NestJS Module & Guard Architecture

```typescript
// Global middleware / interceptors (applied via app.module.ts):
1. RequestIdInterceptor     // Attach unique request ID + OTel trace context
2. CORS (NestJS built-in)   // Allow frontend origin
3. ThrottlerGuard           // ElastiCache Redis-backed per-IP and per-user limits (@nestjs/throttler)
4. JwtAuthGuard             // Validate Cognito JWT via @nestjs/passport, attach user
5. DomainGuard              // Verify email ends with @mito.hu
6. RolesGuard               // Check user role via @Roles() decorator
7. ZodValidationPipe        // Zod schema validation for body/params/query (nestjs-zod)
8. Controller method        // Route handler
9. AllExceptionsFilter      // Structured error responses + logging
10. OTelSpanInterceptor     // Close OpenTelemetry span with status

// NestJS modules:
// - AppModule (root)
//   ├── AuthModule         (passport strategies, guards)
//   ├── UsersModule        (user CRUD, repository)
//   ├── JourneysModule     (journey CRUD, step management)
//   ├── KpisModule         (KPI definitions, measurements)
//   ├── EvidenceModule     (evidence upload, S3 integration)
//   ├── RunsModule         (RunRequest state machine, BullMQ integration)
//   ├── KbModule           (KB chat endpoints)
//   ├── AdminModule        (admin-only endpoints)
//   ├── EventsModule       (event tracking)
//   └── HealthModule       (health check + readiness)
```

### 7.4 Event Tracking Model

All significant user actions emit events for adoption metrics (stored in DynamoDB `events` table):

```typescript
interface UserEvent {
  userId: string;
  timestamp: string;
  eventId: string;               // ULID
  event: string;                 // e.g., 'journey.started', 'step.completed', 'kb.query'
  properties: Record<string, unknown>;
  sessionId: string;
}
```

Events emitted:
- `auth.login`, `auth.logout`
- `onboarding.completed`
- `journey.generated`, `journey.regenerated`, `journey.activated`
- `step.started`, `step.evidence_submitted`, `step.completed`
- `kpi.measured`
- `kb.query.started`, `kb.query.completed`
- `run.requested`, `run.approved`, `run.cancelled`, `run.completed`
- `admin.ingestion.started`, `admin.ingestion.stopped`

### 7.5 Deliverables Checklist

- [ ] NestJS server with TypeScript strict mode
- [ ] NestJS module structure (Auth, Users, Journeys, Kpis, Evidence, Runs, Kb, Admin, Events, Health)
- [ ] DynamoDB repository layer for all tables (injectable services)
- [ ] Zod validation schemas + nestjs-zod pipes
- [ ] Auth guard (Cognito JWT via @nestjs/passport + domain check)
- [ ] Roles guard with @Roles() decorator
- [ ] All CRUD controllers implemented
- [ ] Run request creation and state machine transitions
- [ ] Evidence upload with S3 integration
- [ ] Event tracking interceptor
- [ ] OpenAPI spec auto-generated (@nestjs/swagger decorators)
- [ ] Rate limiting (@nestjs/throttler + ElastiCache Redis store)
- [ ] Error handling with global exception filter
- [ ] OpenTelemetry SDK integration (tracing + metrics + log correlation)
- [ ] DynamoDB table + GSI creation (via Terraform)
- [ ] Seed script for baseline data
- [ ] Vitest coverage ≥ 80% for business logic
- [ ] Health check endpoint (`/health`)

---

## 8. Workstream D — Knowledge Base Builder

### 8.1 Pipeline Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    KB Builder Pipeline                            │
│                                                                  │
│  [Seeds JSON] ──► CRAWL ──► EXTRACT ──► DEDUPE ──► QUALITY     │
│                     │          │          │        FILTER         │
│                     ▼          ▼          ▼          │           │
│                  (fetch)   (readability) (hash+sim)  ▼           │
│                     │          │          │      ┌────────┐      │
│                     ▼          ▼          ▼      │APPROVE │      │
│                  [S3 raw]  [cleaned]   [deduped] │ GATE   │      │
│                                                  └───┬────┘      │
│                                                      ▼           │
│                                                 SUMMARIZE        │
│                                                 (OpenAI)         │
│                                                      │           │
│                                                      ▼           │
│                                                 [DynamoDB]       │
│                                                 [summary]        │
│                                                      │           │
│                                                      ▼           │
│                                                  INGEST          │
│                                                 (Bedrock KB)     │
│                                                      │           │
│                                                      ▼           │
│                                                   DONE           │
└──────────────────────────────────────────────────────────────────┘

 All steps are idempotent. Each step updates article.status.
 Pipeline checks for CANCEL_REQUESTED between every step.
```

### 8.2 Crawler Component

```typescript
// Pseudocode
class Crawler {
  // Configuration
  seeds: SeedConfig[];           // URL patterns with depth limits
  allowlist: string[];           // Allowed domains
  maxDepth: number;              // Default: 2
  maxPagesPerSeed: number;       // Default: 50
  politeDelayMs: number;         // Default: 2000 (robots.txt aware)
  userAgent: string;

  async crawl(seed: SeedConfig): Promise<CrawlResult[]> {
    // 1. Fetch robots.txt for domain
    // 2. BFS from seed URL up to maxDepth
    // 3. For each page:
    //    a. Check URL against allowlist
    //    b. Fetch with timeout + retry
    //    c. Store raw HTML in S3
    //    d. Create Article record with status='fetched'
    //    e. Respect politeDelayMs between requests
    //    f. Check for cancellation
    // 4. Return list of fetched article IDs
  }
}
```

**Initial seed list**:
```json
{
  "seeds": [
    {
      "url": "https://simonwillison.net/",
      "maxDepth": 2,
      "maxPages": 100,
      "priority": "high"
    }
  ],
  "allowlist": [
    "simonwillison.net"
  ]
}
```

> The seed list and allowlist are admin-configurable via the admin UI and stored in DynamoDB.

### 8.3 Extraction Component

```typescript
class Extractor {
  async extract(articleId: ObjectId): Promise<void> {
    // 1. Fetch raw HTML from S3
    // 2. Apply Readability (Mozilla readability or similar)
    // 3. Strip boilerplate (nav, footer, ads, scripts)
    // 4. Extract: title, author, published date, main content
    // 5. Normalize text (unicode, whitespace)
    // 6. Compute content hash (SHA-256)
    // 7. Store cleaned text in S3 (separate key)
    // 8. Update Article with metadata + contentHash
    // 9. Set status='extracted'
  }
}
```

Libraries: `@mozilla/readability`, `jsdom`, `linkedom`

### 8.4 Deduplication Component

```typescript
class Deduplicator {
  async dedupe(articleId: ObjectId): Promise<boolean> {
    // 1. Load article contentHash
    // 2. Exact match: check if contentHash exists in other articles
    // 3. Near-duplicate: compute simhash or minhash
    //    Compare against existing articles with similarity > 0.85
    // 4. If duplicate:
    //    a. Mark article.dedupe.isDuplicate = true
    //    b. Link to similar article
    //    c. Set status='deduped' (will be skipped in later stages)
    // 5. If unique: set status='deduped'
    // Return: true if unique, false if duplicate
  }
}
```

### 8.5 Quality Filter

```typescript
class QualityFilter {
  criteria = {
    minWordCount: 200,
    minContentLength: 500,       // characters
    maxAge: 365 * 3,             // days (3 years)
    allowedDomains: Set<string>, // from admin config
    recencyBoost: true,          // newer articles score higher
  };

  async filter(articleId: ObjectId): Promise<boolean> {
    // 1. Load article metadata
    // 2. Check: word count >= minWordCount
    // 3. Check: content length >= minContentLength
    // 4. Check: source domain in allowedDomains
    // 5. Check: age <= maxAge (if publishedAt known)
    // 6. Compute quality score (0-100):
    //    - Content length factor (20%)
    //    - Recency factor (20%)
    //    - Source reputation factor (30%)
    //    - Structure factor (headings, lists, code blocks) (30%)
    // 7. Store qualityScore
    // 8. If score >= threshold (default 40): status='quality_passed'
    //    Else: status='quality_failed'
    // Return: whether passed
  }
}
```

### 8.6 Summarizer Component

```typescript
class Summarizer {
  async summarize(articleId: ObjectId, runRequestId: ObjectId): Promise<void> {
    // 1. Load cleaned text from S3
    // 2. Check run is still APPROVED (not CANCEL_REQUESTED)
    // 3. Build prompt from template:
    //    - System prompt: role as AI knowledge curator
    //    - User prompt: article text + output schema
    // 4. Call OpenAI chat completion
    //    - Model: gpt-4o (configurable)
    //    - Response format: JSON mode
    //    - Max tokens: configured budget
    // 5. Parse response into Summary schema
    // 6. Validate output:
    //    - Has title, ≥3 key points, ≥1 do, ≥1 don't
    //    - Tags are from allowed taxonomy
    //    - Citations reference actual content
    // 7. Store Summary in DynamoDB
    // 8. Update Article status='summarized'
    // 9. Log token usage and cost to RunLog
  }
}
```

**Summarization prompt template**:
```
SYSTEM:
You are an AI knowledge curator. Your task is to create a structured summary
of an article about AI practices for workplace adoption.

Output a JSON object with this exact schema:
{
  "title": "concise descriptive title",
  "keyPoints": ["point 1", "point 2", ...],  // 3-7 key takeaways
  "dos": ["best practice 1", ...],           // actionable recommendations
  "donts": ["anti-pattern 1", ...],          // things to avoid
  "tags": ["tag1", "tag2"],                  // from: [prompt-engineering, code-generation,
                                             //        document-generation, data-analysis,
                                             //        process-automation, critical-evaluation,
                                             //        information-synthesis, tools, strategy,
                                             //        ethics, security, productivity]
  "difficulty": "beginner|intermediate|advanced",
  "roleRelevance": [
    {"role": "engineering", "relevanceScore": 0.9},
    ...                                       // for each of: engineering, pm, design, hr, finance, sales
  ],
  "citations": [
    {"text": "quoted text from article", "sourceSection": "section heading or paragraph ref"}
  ]
}

USER:
Summarize the following article:

---
{articleText}
---
```

### 8.7 Bedrock KB Ingestion

```typescript
class BedrockIngestor {
  async ingest(summaryIds: ObjectId[]): Promise<void> {
    // 1. For each summary:
    //    a. Format as document for Bedrock KB
    //    b. Include metadata: tags, difficulty, roles, source URL
    //    c. Upload to S3 data source bucket (Bedrock KB reads from S3)
    // 2. Trigger Bedrock KB sync/ingestion job
    // 3. Wait for sync completion (poll status)
    // 4. Update each summary with bedrockKbDocId
    // 5. Update each article status='ingested'
  }
}
```

### 8.8 Admin Ingestion UI Controls

| Control | Action | Implementation |
|---|---|---|
| **Start Crawl** | Begin crawling from seeds | Creates RunRequest (purpose=kb_ingestion), requires admin approval |
| **Stop Crawl** | Cancel active crawl | Sets CANCEL_REQUESTED, worker stops between pages |
| **Review Candidates** | View extracted articles before summarization | List articles with status=quality_passed, admin approves/rejects |
| **Start Summarization** | Process approved articles | Creates RunRequest per batch, admin clicks Start |
| **Start Ingestion** | Push summaries to Bedrock KB | Creates RunRequest, admin approval |
| **Pipeline Status** | View progress + stats | Real-time status from ElastiCache Redis + DynamoDB |

### 8.9 Deliverables Checklist

- [ ] Crawler with robots.txt respect, allowlist, depth limits
- [ ] Readability-based extraction
- [ ] SHA-256 + similarity deduplication
- [ ] Quality scoring with configurable thresholds
- [ ] Summarization with OpenAI (structured JSON output)
- [ ] Bedrock KB S3 data source integration
- [ ] Bedrock KB sync trigger
- [ ] Pipeline orchestrator with step-by-step execution
- [ ] Cancellation checking between every pipeline step
- [ ] Admin UI: start/stop crawl, review candidates, approve ingestion
- [ ] Pipeline status dashboard
- [ ] S3 storage for raw HTML and cleaned text
- [ ] Idempotent pipeline (can resume from any step)
- [ ] Vitest tests for each pipeline component
- [ ] Seed configuration (JSON + admin editable)

---

## 9. Workstream E — Personalization Agent

### 9.1 Flow

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  Onboarding │────►│  RunRequest  │────►│  Bedrock KB   │
│    Intake    │     │  (approved)  │     │   Retrieval   │
└─────────────┘     └──────────────┘     └───────┬───────┘
      │                                          │
      │  User inputs:                            │  Retrieved:
      │  • Job description                       │  • Best practices
      │  • Tools used                            │  • Role-relevant articles
      │  • Comfort level                         │  • KPI examples
      │  • Goals                                 │
      ▼                                          ▼
┌─────────────────────────────────────────────────────────┐
│                    OpenAI Generation                     │
│                                                         │
│  Prompt:                                                │
│  • System: journey design expert                        │
│  • Context: retrieved KB passages                       │
│  • User: profile + preferences                          │
│  • Output: Journey + Steps + KPIs (JSON)                │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│                    Evaluator                            │
│                                                        │
│  Checks:                                               │
│  • Every step has measurable KPI                       │
│  • KPI targets are realistic                           │
│  • No policy violations                                │
│  • Proper citations for recommended practices          │
│  • Level progression is logical                        │
│  • Role-appropriate content                            │
│  • Safety: no harmful/biased recommendations           │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │  Store Journey   │
              │  + Steps + KPIs  │
              │  in DynamoDB     │
              └──────────────────┘
```

### 9.2 Intake Questions

| # | Question | Field | Required | Type |
|---|---|---|---|---|
| 1 | "Describe your job in a few words" | `jobDescription` | Yes | Free text (max 500 chars) |
| 2 | "What tools do you use daily?" | `preferences.tools` | No | Multi-select + custom |
| 3 | "Describe your key workflows" | `preferences.workflows` | No | Free text (max 300 chars) |
| 4 | "How comfortable are you with AI tools?" | `preferences.comfortLevel` | Yes | Single select: beginner/intermediate/advanced |
| 5 | "What are your goals with AI?" | `preferences.goals` | No | Multi-select + custom |

### 9.3 Retrieval Strategy

```typescript
async function retrieveContext(userProfile: UserProfile): Promise<RetrievedContext> {
  // 1. Build retrieval query from user profile:
  //    "AI best practices for {jobDescription} role, {comfortLevel} level,
  //     using {tools}, for {goals}"

  // 2. Query Bedrock KB with:
  //    - numberOfResults: 10
  //    - Filter by roleRelevance matching user's role category
  //    - Filter by difficulty matching comfort level

  // 3. Post-process results:
  //    - Deduplicate overlapping passages
  //    - Rank by relevance score
  //    - Cap at ~4000 tokens of context

  // Return: retrieved passages with source attribution
}
```

### 9.4 Generation Prompt Template

```
SYSTEM:
You are an AI journey design expert. Create a personalized, measurable
AI experimentation journey for an employee.

RULES:
- Every step MUST have at least one measurable KPI with a specific target.
- Use ONLY information from the provided knowledge base context.
- If the context doesn't cover a topic, say so — do NOT fabricate advice.
- Steps must progress logically from L0 (awareness) through L4 (innovation).
- Include role-specific examples relevant to the employee's job.
- Each step must specify: task, expected output, evidence type, KPI targets, review method.

Output a JSON object matching this schema:
{journeySchema}

CONTEXT (from knowledge base):
{retrievedPassages}

USER PROFILE:
- Job: {jobDescription}
- Tools: {tools}
- Comfort level: {comfortLevel}
- Goals: {goals}
- Workflows: {workflows}

Generate a journey with:
- L0: 3-4 awareness steps
- L1: 4-5 exploration steps
- L2: 5-6 integration steps
- L3: 3-4 optimization steps (can be generated but initially locked)
- L4: 2-3 innovation steps (can be generated but initially locked)
```

### 9.5 Evaluator Checks

| Check | Rule | Action on Failure |
|---|---|---|
| Measurability | Every step has ≥1 KPI with numeric/boolean target | Reject, log, request regeneration |
| Completeness | All levels have minimum step count | Reject, log, request regeneration |
| Safety | No harmful, biased, or policy-violating content | Reject, flag for admin review |
| Citations | Recommended practices cite KB sources | Warn, but allow (mark uncited) |
| Progression | L(n+1) steps build on L(n) skills | Warn, allow |
| Role fit | ≥70% of steps are relevant to user's role | Reject, request regeneration |
| Budget | Output tokens within per-run budget | Truncate or split |

### 9.6 Regenerate and Refine Controls

| Action | Trigger | Behavior |
|---|---|---|
| **Regenerate** | User clicks "Regenerate Journey" | Creates new RunRequest, generates new journey (version+1), keeps old version |
| **Refine** | User provides feedback text + clicks "Refine" | Creates RunRequest with previous journey + feedback as context, generates updated version |

Both actions are manual (require explicit user click → RunRequest → execution).

### 9.7 Deliverables Checklist

- [ ] Intake flow connected to user profile
- [ ] Bedrock KB retrieval strategy with role/difficulty filters
- [ ] Generation prompt template with strict measurability rules
- [ ] OpenAI structured output parsing
- [ ] Evaluator with all checks (measurability, completeness, safety, citations, progression, role fit)
- [ ] Journey + Steps + KPIs storage in DynamoDB
- [ ] Version management (keep history of regenerations)
- [ ] Regenerate and Refine controls in UI
- [ ] RunRequest integration for all generation calls
- [ ] Test suite: prompt output validation, evaluator logic, edge cases

---

## 10. Workstream F — Platform / Infra / DevEx

### 10.1 Environment Strategy (MVP — Single Environment)

| Environment | Purpose | Scale | Deploy |
|---|---|---|---|
| `mvp` | Development + production (single stack) | Minimal (1 task each) | Auto on merge to `main` |
| `local` | Local development via Docker Compose | DynamoDB Local + Redis | Manual (`docker compose up`) |

There are no separate dev/stage/prod environments. This reduces Terraform complexity, eliminates environment drift, and cuts costs. Once the platform is validated, multi-environment can be added later.

### 10.2 Terraform Module Specifications

#### `modules/networking`

```hcl
# MVP: Minimal VPC with public subnets only (no NAT Gateway = saves $35/month)
#
# Resources:
# - VPC with 2 AZs (minimum for ALB)
# - Public subnets (ECS tasks, ALB)
# - Internet Gateway
# - Route tables
#
# NOT included (deferred to post-MVP):
# - Private subnets
# - NAT Gateway (saves $35/month)
# - VPC Flow Logs
#
# Trade-off: ECS tasks in public subnets with restrictive security groups.
# Acceptable for MVP with ~50 internal users. Add private subnets + NAT later.
#
# Outputs: vpc_id, public_subnet_ids
```

#### `modules/security`

```hcl
# Resources:
# - IAM roles (pre-created by admin, referenced by ARN):
#   - ECS task execution role
#   - ECS task role (shared for all services in MVP)
# - Security groups:
#   - ALB (inbound 443 from anywhere)
#   - ECS tasks (inbound from ALB SG only on app ports)
#   - ElastiCache (inbound from ECS SG only on 6379)
#
# NOT included (deferred):
# - KMS keys (use AWS-managed keys for MVP)
# - Separate task roles per service (shared role in MVP)
```

#### `modules/compute`

```hcl
# Resources:
# - ECS Cluster (Fargate)
# - ECS Service: api
#   - Task definition: 0.25 vCPU, 0.5 GB RAM
#   - Desired count: 1
#   - Health check: /health
#   - ALB target group
# - ECS Service: worker
#   - Task definition: 0.25 vCPU, 0.5 GB RAM
#   - Desired count: 1
#   - No ALB (internal only, connects to ElastiCache)
# - ECS Service: kb-builder
#   - Task definition: 0.25 vCPU, 0.5 GB RAM
#   - Desired count: 0 (scaled to 1 only when pipeline runs)
# - ECR repositories for each service
# - ALB (application load balancer, shared)
# - ACM certificate (for HTTPS on ALB)
#
# Cost: ~$20/month for 2 always-on tasks (api + worker)
# KB builder runs on-demand only
#
# NOT included (deferred):
# - Auto-scaling
# - Service discovery
# - CloudFront distribution (ALB serves API directly)
```

#### `modules/data`

```hcl
# Resources:
# - DynamoDB tables (all on-demand billing):
#   - users, journeys, steps, kpis, evidence
#   - run_requests, run_logs, articles, summaries, events
#   - All GSIs as defined in data model
#   - Point-in-time recovery: enabled
#   - Encryption: AWS-managed keys
#
# - ElastiCache Redis:
#   - Engine: Redis 7.x
#   - Node type: cache.t3.micro (0.5 GB RAM)
#   - Single node (no replication for MVP)
#   - In-transit encryption: enabled
#   - Auth token from Secrets Manager
#
# - S3 buckets:
#   - aijourney-mvp-raw-content    (crawler snapshots)
#   - aijourney-mvp-evidence       (user evidence uploads)
#   - aijourney-mvp-bedrock-data   (Bedrock KB data source)
#   - aijourney-mvp-frontend       (static site hosting via CloudFront)
#   - Lifecycle: archive raw content after 90 days (S3 IA)
#   - Encryption: SSE-S3 (free, no KMS cost)
#   - Versioning: enabled for evidence bucket only
#
# Cost estimate:
# - DynamoDB: ~$0 (free tier covers 25 GB + 25 WCU/RCU)
# - ElastiCache t3.micro: ~$12/month
# - S3: ~$1/month (minimal data)
```

#### `modules/cognito`

```hcl
# Resources:
# - Cognito User Pool:
#   - Google IdP federation
#   - Hosted UI domain (Cognito-provided, e.g., aijourney-mvp.auth.eu-central-1.amazoncognito.com)
#   - App client with OAuth2 code grant
#   - Callback URLs for MVP domain
#   - Domain restriction: attribute_condition = email ends with @mito.hu
# - Cognito User Pool Domain
#
# Cost: Free (< 50K MAU)
#
# NOT included (deferred):
# - Custom domain for hosted UI (requires ACM cert + Route53)
# - Identity Pool
```

#### `modules/bedrock`

```hcl
# Resources:
# - Bedrock Knowledge Base:
#   - S3 data source (points to bedrock-data bucket)
#   - Embedding model: amazon.titan-embed-text-v2:0
#   - Vector store: Bedrock-managed (OpenSearch Serverless under the hood)
#   - Chunking strategy: default (300 tokens, 20% overlap)
# - IAM role for Bedrock KB to access S3 (pre-created by admin)
#
# Cost: ~$7/month for OpenSearch Serverless minimum + per-query charges
```

#### `modules/observability`

```hcl
# MVP: Minimal observability — just enough to debug issues
#
# Resources:
# - CloudWatch Log Groups:
#   - /ecs/aijourney-mvp/api (7-day retention for MVP)
#   - /ecs/aijourney-mvp/worker (7-day retention)
#   - /ecs/aijourney-mvp/kb-builder (7-day retention)
# - CloudWatch Alarms (basic):
#   - ECS service unhealthy (any service task count = 0)
#   - High error rate (>10% 5xx in 5 min)
# - SNS topic for alarm notifications (email)
#
# NOT included (deferred):
# - Custom metrics
# - CloudWatch Dashboard
# - Detailed cost alarms
# - Per-service metrics
#
# Cost: ~$2/month (log ingestion + storage)
```

### 10.3 Secrets Management

| Secret | Service | Source |
|---|---|---|
| `openai-api-key` | worker | AWS Secrets Manager |
| `elasticache-auth-token` | api, worker | AWS Secrets Manager |
| `cognito-client-secret` | api | AWS Secrets Manager |
| `session-signing-key` | api | AWS Secrets Manager |

DynamoDB and S3 access is handled via IAM task roles — no credentials needed.

### 10.4 Deliverables Checklist

- [ ] Terraform module: networking (VPC, public subnets, IGW)
- [ ] Terraform module: security (IAM references, SGs)
- [ ] Terraform module: compute (ECS Cluster, ALB, services, task defs)
- [ ] Terraform module: data (DynamoDB tables + GSIs, ElastiCache, S3)
- [ ] Terraform module: cognito (User Pool, Google IdP)
- [ ] Terraform module: bedrock (KB, data source, vector store)
- [ ] Terraform module: observability (log groups, basic alarms)
- [ ] Single MVP environment config
- [ ] S3 backend for Terraform state
- [ ] GitLab CI/CD pipeline (see Section 14)
- [ ] Local development setup (docker-compose with DynamoDB Local + Redis)

---

## 11. Manual Start/Stop LLM Control System

This is a **cross-cutting concern** that underpins all LLM usage in the platform.

### 11.1 State Machine

```
                                ┌──────────┐
                     ┌─────────►│ REJECTED │
                     │          └──────────┘
                     │
┌─────────┐    ┌─────┴────┐    ┌──────────┐    ┌───────────┐
│ PENDING ├───►│ APPROVED ├───►│ RUNNING  ├───►│ COMPLETED │
└─────────┘    └──────────┘    └─────┬────┘    └───────────┘
     │              │                │
     │              │                ├─────────►┌────────┐
     │              │                │          │ FAILED │
     │              │                │          └────────┘
     │              │                │
     │              │           ┌────▼──────────┐    ┌───────────┐
     │              │           │CANCEL_REQUESTED├───►│ CANCELLED │
     │              │           └────────────────┘    └───────────┘
     │              │
     │         auto-approve
     │         (user's own
     │          chat/journey
     │          runs)
     │
  admin approval
  required for:
  - KB ingestion
  - Bulk operations
```

### 11.2 State Transitions

| From | To | Trigger | Actor |
|---|---|---|---|
| — | PENDING | Run request created | User/System |
| PENDING | APPROVED | User clicks "Start" (auto-approve) OR admin approves | User/Admin |
| PENDING | REJECTED | Admin rejects | Admin |
| APPROVED | RUNNING | Worker picks up job | System (Worker) |
| RUNNING | COMPLETED | Execution succeeds | System (Worker) |
| RUNNING | FAILED | Execution fails (error, timeout, budget exceeded) | System (Worker) |
| RUNNING | CANCEL_REQUESTED | User/admin clicks "Stop" | User/Admin |
| CANCEL_REQUESTED | CANCELLED | Worker acknowledges and stops | System (Worker) |

### 11.3 Budget Enforcement

```typescript
interface RunBudget {
  maxInputTokens: number;        // Max tokens in prompt
  maxOutputTokens: number;       // Max tokens in response
  maxTotalTokens: number;        // Overall cap
  maxDurationMs: number;         // Wall-clock timeout
  maxCostUsd: number;            // Dollar cap for this run
}

// Default budgets by purpose:
const DEFAULT_BUDGETS: Record<RunPurpose, RunBudget> = {
  kb_chat: {
    maxInputTokens: 4000,
    maxOutputTokens: 2000,
    maxTotalTokens: 6000,
    maxDurationMs: 30_000,       // 30 seconds
    maxCostUsd: 0.05,
  },
  personalization: {
    maxInputTokens: 8000,
    maxOutputTokens: 4000,
    maxTotalTokens: 12000,
    maxDurationMs: 60_000,       // 60 seconds
    maxCostUsd: 0.15,
  },
  summarization: {
    maxInputTokens: 6000,
    maxOutputTokens: 2000,
    maxTotalTokens: 8000,
    maxDurationMs: 45_000,       // 45 seconds
    maxCostUsd: 0.08,
  },
  kb_ingestion: {
    maxInputTokens: 100_000,     // Batch budget
    maxOutputTokens: 50_000,
    maxTotalTokens: 150_000,
    maxDurationMs: 600_000,      // 10 minutes
    maxCostUsd: 2.00,
  },
};
```

### 11.4 Concurrency Controls

```typescript
const CONCURRENCY_LIMITS = {
  global: {
    maxConcurrentRuns: 5,        // Total across all users
    maxConcurrentPerPurpose: {
      kb_chat: 3,
      personalization: 2,
      summarization: 1,
      kb_ingestion: 1,
    },
  },
  perUser: {
    maxConcurrentRuns: 2,
    maxRunsPerHour: 20,
    maxRunsPerDay: 100,
  },
};
```

Enforced via ElastiCache Redis atomic counters and distributed locks.

### 11.5 Cancellation Protocol

```typescript
// Worker pseudo-code
async function executeRun(runRequest: RunRequest): Promise<void> {
  // Before EVERY LLM call or pipeline step:
  if (await isCancelRequested(runRequest._id)) {
    await markCancelled(runRequest._id);
    return;
  }

  // For streaming LLM calls:
  // Check cancel flag every N chunks (e.g., every 10 chunks)
  const stream = await openai.chat.completions.create({ stream: true, ... });
  let chunkCount = 0;
  for await (const chunk of stream) {
    chunkCount++;
    if (chunkCount % 10 === 0) {
      if (await isCancelRequested(runRequest._id)) {
        stream.controller.abort();
        await markCancelled(runRequest._id);
        return;
      }
    }
    // Process chunk
  }
}

// Cancel flag check (fast ElastiCache Redis lookup)
async function isCancelRequested(runId: ObjectId): Promise<boolean> {
  const state = await redis.get(`runstate:${runId}`);
  return state === 'CANCEL_REQUESTED';
}
```

### 11.6 Audit Log Requirements

Every run produces audit entries:

| Field | Description |
|---|---|
| `runRequestId` | Link to the run |
| `userId` | Who initiated |
| `purpose` | What type of run |
| `model` | Model used |
| `promptHash` | SHA-256 of the prompt (not raw prompt text) |
| `inputTokens` | Actual input tokens |
| `outputTokens` | Actual output tokens |
| `durationMs` | Wall-clock time |
| `costUsd` | Estimated cost |
| `status` | Final status |
| `startedBy` | Who approved/started |
| `stoppedBy` | Who cancelled (if applicable) |

Audit logs are immutable (append-only collection, no updates/deletes).

---

## 12. Milestone Plan & Exit Criteria

### Phase 0 — Alignment (Weeks 1–2)

| # | Task | Owner | Exit Criteria |
|---|---|---|---|
| 0.1 | Define journey KPI rubric for L0–L2 | Product | Documented rubric with measurable targets |
| 0.2 | Define v1 role taxonomy (6 roles) | Product | Role definitions with competency mapping |
| 0.3 | Decide: static SPA vs SSR | Engineering | ADR-001 written and approved |
| 0.4 | Decide: KB chat model (OpenAI vs Bedrock) | Engineering | ADR-003 written and approved |
| 0.5 | Create UX wireframes | Design | All screens wireframed and reviewed |
| 0.6 | Finalize data schemas | Engineering | DynamoDB table schemas + Zod types reviewed |
| 0.7 | Create GitLab repo with structure | Engineering | Repo created, CI skeleton, all directories |

**Phase 0 exit**: Approved data schemas + UX wireframes + architecture decision records.

### Phase 1 — Foundation (Weeks 3–5)

| # | Task | Dependency | Exit Criteria |
|---|---|---|---|
| 1.1 | Terraform: networking module | — | VPC + public subnets deployed to MVP |
| 1.2 | Terraform: security module | 1.1 | IAM role references, SGs created |
| 1.3 | Terraform: data module | 1.1, 1.2 | DynamoDB tables + ElastiCache accessible |
| 1.4 | Terraform: cognito module | — | User pool with Google IdP configured |
| 1.5 | Terraform: compute module | 1.1–1.3 | ECS cluster + API service running |
| 1.6 | Terraform: observability | 1.5 | Logs flowing to CloudWatch |
| 1.7 | API: server scaffold + health check | — | NestJS app with /health endpoint |
| 1.8 | API: auth middleware | 1.4, 1.7 | JWT validation + domain check working |
| 1.9 | API: user CRUD + DynamoDB repositories | 1.7 | Create/read/update users via API |
| 1.10 | API: RunRequest model + state machine | 1.9 | Run CRUD + state transitions + tests |
| 1.11 | Svelte: project scaffold | — | SvelteKit app with Tailwind, builds clean |
| 1.12 | Svelte: auth flow | 1.4, 1.8 | Login → Cognito → callback → session |
| 1.13 | Svelte: basic dashboard shell | 1.12 | Logged-in user sees placeholder journey page |
| 1.14 | Shared package: types + schemas | — | All interfaces + Zod schemas exported |
| 1.15 | CI/CD: lint + test + build stages | — | Pipeline runs on every push |
| 1.16 | Docker: Dockerfiles for all services | — | All 3 services build successfully |
| 1.17 | Local dev: docker-compose | — | DynamoDB Local + Redis + all services run locally |

**Phase 1 exit**: Employee can log in with mito.hu Google account and see a placeholder journey shell.

### Phase 2 — KB Builder MVP (Weeks 6–9)

| # | Task | Dependency | Exit Criteria |
|---|---|---|---|
| 2.1 | Crawler: HTTP fetch + S3 storage | 1.3 | Can fetch from Simon Willison blog, store in S3 |
| 2.2 | Extractor: Readability parse | 2.1 | Clean text extracted, metadata captured |
| 2.3 | Deduplicator: hash + similarity | 2.2 | Duplicate articles detected and flagged |
| 2.4 | Quality filter: scoring + threshold | 2.3 | Articles scored, low-quality filtered |
| 2.5 | Summarizer: OpenAI integration | 2.4, 1.10 | Summaries generated via RunRequest flow |
| 2.6 | Bedrock KB: setup + ingestion | 2.5 | Summaries in Bedrock KB, retrievable |
| 2.7 | Worker: BullMQ queue for summarization | 1.10 | Jobs processed only when APPROVED |
| 2.8 | Worker: cancellation checking | 2.7 | Stop button halts active summarization |
| 2.9 | Admin UI: ingestion controls | 2.7 | Start/stop crawl, review candidates |
| 2.10 | Admin UI: candidate review | 2.4, 2.9 | Approve/reject articles before summarization |
| 2.11 | Pipeline orchestrator | 2.1–2.6 | Full pipeline runs end-to-end, idempotent |
| 2.12 | Audit logging for KB runs | 2.7 | All run events logged with token/cost data |

**Phase 2 exit**: Can ingest curated articles on-demand and query them via Bedrock KB API.

### Phase 3 — NotebookLM-like KB Chat UI (Weeks 10–11)

| # | Task | Dependency | Exit Criteria |
|---|---|---|---|
| 3.1 | API: KB query endpoint | 2.6 | Retrieves relevant passages from Bedrock KB |
| 3.2 | Worker: KB chat worker | 3.1, 2.7 | Generates answers with citations |
| 3.3 | Svelte: Chat UI component | 1.13 | Single-input chat with message history |
| 3.4 | Svelte: Run controls in chat | 3.3, 1.10 | Start/Stop buttons, status indicator |
| 3.5 | Svelte: Citation display | 3.3 | Inline citations with source popover |
| 3.6 | Svelte: Cost/token display | 3.4 | Per-message token count and cost shown |
| 3.7 | Configurable model switch | 3.2 | Admin can switch between OpenAI and Bedrock for generation |
| 3.8 | Chat history persistence | 3.3 | User can see past conversations |

**Phase 3 exit**: Employees can ask questions and get sourced answers from KB with manual run control.

### Phase 4 — Personalization Agent MVP (Weeks 12–15)

| # | Task | Dependency | Exit Criteria |
|---|---|---|---|
| 4.1 | Svelte: onboarding intake flow | 1.12 | Multi-step form, saves to user profile |
| 4.2 | Retrieval strategy implementation | 2.6 | Profile-based KB retrieval with filters |
| 4.3 | Generation prompt + output parsing | 4.2 | Journey JSON generated from prompt |
| 4.4 | Evaluator: all checks | 4.3 | Measurability, completeness, safety validated |
| 4.5 | Journey storage + versioning | 4.3 | Journey + steps + KPIs saved in DynamoDB |
| 4.6 | Svelte: journey dashboard | 4.5 | Level navigation, step list, progress bars |
| 4.7 | Svelte: step detail + evidence | 4.6 | Task display, evidence upload, KPI input |
| 4.8 | Svelte: KPI progress widgets | 4.7 | Per-step and journey-level KPI visualization |
| 4.9 | Svelte: regenerate + refine | 4.5 | Buttons with RunRequest integration |
| 4.10 | Worker: personalization worker | 4.3, 2.7 | Journey generation via BullMQ |
| 4.11 | API: journey + step + KPI + evidence endpoints | 4.5 | Full CRUD operational |
| 4.12 | Audit logging for personalization runs | 4.10 | All events logged |
| 4.13 | Seed: baseline journeys for 6 roles | 4.5 | Pre-generated journeys available |

**Phase 4 exit**: User can generate a journey and complete steps with measurable progress.

### Phase 5 — Hardening & Rollout (Weeks 16–18)

| # | Task | Dependency | Exit Criteria |
|---|---|---|---|
| 5.1 | Security review: auth, RBAC, input validation | All | No critical findings |
| 5.2 | Rate limiting tuning | All | Per-user and global limits in place |
| 5.3 | DynamoDB backup testing | 1.3 | Point-in-time recovery verified |
| 5.4 | Cost monitoring setup | All | CloudWatch billing alarm in place |
| 5.5 | Admin analytics dashboard | 4.11 | Org-level KPIs visible |
| 5.6 | Content governance review | 2.11, 4.4 | Evaluator catches policy violations |
| 5.7 | Pilot group onboarding (10-20 users) | All | Users complete L0 steps with feedback |
| 5.8 | Feedback analysis + fixes | 5.7 | Critical feedback addressed |
| 5.9 | Org-wide launch | 5.8 | All mito.hu employees can access |

**Phase 5 exit**: Stable MVP with pilot validation. Post-MVP: add WAF, private subnets, multi-env, auto-scaling.

---

## 13. KPI Framework

### Layer 1: Per-Step Outcome KPIs (Employee-Level)

| KPI | Measurement | Target (varies by step) | Evidence |
|---|---|---|---|
| Output Quality Score | Rubric 1–5 (self + optional peer) | ≥ 3 | Self-assessment form |
| Task Completion | Boolean | true | Evidence submission |
| Time Saved Estimate | Minutes (before vs after) | > 0 | Before/after comparison text |
| Workflow Adoption | Count of real-work uses | ≥ 1 per step | Usage log / screenshot |
| Safety Compliance | Boolean (no violations) | true | Auto-check + self-report |
| Citation Usage | Boolean (sources cited) | true | Output review |

### Layer 2: Journey Progress KPIs

| KPI | Formula | Target |
|---|---|---|
| Level Completion % | completed_steps / total_steps per level × 100 | 100% for each level |
| Median Time to Level-Up | median(completion_date - start_date) per level | ≤ estimated duration |
| Weekly Active Engagement | sessions_this_week > 0 | ≥ 1 session/week |
| Evidence Quality | avg(quality_score) across submitted evidence | ≥ 3.5 |
| Step Completion Rate | steps_completed / steps_available | Monotonically increasing |

### Layer 3: Org-Level KPIs

| KPI | Formula | Dashboard View |
|---|---|---|
| Weekly Active Users | distinct users with ≥1 action this week | Time series |
| Journey Completion Rate | users_completed_L2+ / users_started | Percentage gauge |
| Top AI-Adopted Workflows | count by workflow tag | Bar chart |
| Cost per Active User | total_llm_cost / active_users this month | Currency trend |
| Cost per Completed Step | total_llm_cost / total_steps_completed | Currency trend |
| Run Approval Throughput | approved_runs / total_run_requests | Percentage |
| Mean Time to Step Completion | avg(completion_date - available_date) | Duration trend |
| KB Article Coverage | articles_ingested / articles_crawled | Percentage |
| KB Chat Satisfaction | (optional) user rating per chat | Average rating |

---

## 14. GitLab CI/CD Pipeline

### 14.1 Pipeline Stages (MVP — Simplified)

```yaml
# .gitlab-ci.yml (high-level structure)
# MVP: Single environment, no promote stage, no multi-env terraform

stages:
  - lint
  - test
  - build
  - security
  - package
  - terraform:plan
  - terraform:apply
  - deploy
  - smoke

variables:
  NODE_VERSION: "24"
  TERRAFORM_VERSION: "1.7"
  AWS_DEFAULT_REGION: eu-central-1

# Stage definitions below
```

### 14.2 Stage Details

#### `lint`

```yaml
lint:eslint:
  stage: lint
  script:
    - pnpm install --frozen-lockfile
    - pnpm lint
    - pnpm format:check
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "main"
```

#### `test`

```yaml
test:unit:
  stage: test
  services:
    - amazon/dynamodb-local:latest
    - redis:7-alpine
  variables:
    DYNAMODB_ENDPOINT: http://amazon-dynamodb-local:8000
    REDIS_URL: redis://redis:6379
  script:
    - pnpm install --frozen-lockfile
    - pnpm test -- --coverage
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "main"

test:e2e:
  stage: test
  script:
    - npx playwright install --with-deps
    - npx playwright test
  artifacts:
    when: on_failure
    paths:
      - apps/web/test-results/
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

#### `build`

```yaml
build:web:
  stage: build
  script:
    - cd apps/web
    - pnpm install --frozen-lockfile
    - pnpm build
  artifacts:
    paths:
      - apps/web/build/

build:api:
  stage: build
  script:
    - cd services/api
    - pnpm install --frozen-lockfile
    - pnpm build
  artifacts:
    paths:
      - services/api/dist/

# Similar for worker and kb-builder
```

#### `security`

```yaml
sast:
  stage: security
  include:
    - template: Security/SAST.gitlab-ci.yml

dependency_scanning:
  stage: security
  include:
    - template: Security/Dependency-Scanning.gitlab-ci.yml

secret_detection:
  stage: security
  include:
    - template: Security/Secret-Detection.gitlab-ci.yml
```

#### `package`

```yaml
package:api:
  stage: package
  image: docker:24
  services:
    - docker:24-dind
  script:
    - docker build -t $CI_REGISTRY_IMAGE/api:$CI_COMMIT_SHA services/api/
    - docker push $CI_REGISTRY_IMAGE/api:$CI_COMMIT_SHA
    - docker tag $CI_REGISTRY_IMAGE/api:$CI_COMMIT_SHA $CI_REGISTRY_IMAGE/api:latest
    - docker push $CI_REGISTRY_IMAGE/api:latest
  rules:
    - if: $CI_COMMIT_BRANCH == "main"

# Similar for worker and kb-builder
```

#### `terraform:plan`

```yaml
terraform:plan:
  stage: terraform:plan
  image: hashicorp/terraform:$TERRAFORM_VERSION
  script:
    - cd infra/terraform
    - terraform init
    - terraform plan -out=plan.tfplan
  artifacts:
    paths:
      - infra/terraform/plan.tfplan
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

#### `terraform:apply`

```yaml
terraform:apply:
  stage: terraform:apply
  image: hashicorp/terraform:$TERRAFORM_VERSION
  script:
    - cd infra/terraform
    - terraform init
    - terraform apply plan.tfplan
  when: manual  # ← Manual approval for safety even in MVP
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

#### `deploy`

```yaml
deploy:mvp:
  stage: deploy
  script:
    - aws ecs update-service --cluster aijourney-mvp --service api --force-new-deployment --no-cli-pager
    - aws ecs update-service --cluster aijourney-mvp --service worker --force-new-deployment --no-cli-pager
    - aws s3 sync apps/web/build/ s3://aijourney-mvp-frontend/ --delete
  environment:
    name: mvp
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

#### `smoke`

```yaml
smoke:mvp:
  stage: smoke
  script:
    - curl -f https://$MVP_API_DOMAIN/health
    - curl -f https://$MVP_FRONTEND_URL/
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

### 14.3 Key Pipeline Requirements

- **Single branch**: `main` is the only deployment branch for MVP (no `develop`).
- **GitLab OIDC → AWS**: Pipeline assumes IAM role via OIDC federation (no long-lived keys).
- **Coverage gates**: Test stage fails if coverage drops below threshold (80% for business logic).
- **Manual gate**: `terraform:apply` is manual for safety.
- **No promote stage**: Single environment means no promotion flow.

---

## 15. Terraform Provisioning Summary

### 15.1 Resource Inventory (Single MVP Environment)

| Module | Resources | MVP Sizing |
|---|---|---|
| networking | VPC, public subnets (2 AZs), IGW | No NAT Gateway, no private subnets |
| security | IAM role references (pre-created), SGs (3) | Shared ECS task role |
| compute | ECS cluster, 3 services, ALB, ACM cert | 0.25 vCPU / 0.5 GB each, 1 task (kb-builder: 0) |
| data | DynamoDB (10 tables), ElastiCache, S3 (4 buckets) | On-demand billing, cache.t3.micro |
| cognito | User pool, Google IdP, app client | Free tier |
| bedrock | KB, S3 data source, vector store | Managed vector store |
| observability | Log groups (3), basic alarms (2), SNS | 7-day log retention |

### 15.2 Cost Estimate (Monthly, MVP)

| Component | Monthly Cost | Notes |
|---|---|---|
| ECS Fargate (api + worker, always on) | ~$18 | 2 × (0.25 vCPU + 0.5 GB) |
| ECS Fargate (kb-builder, on-demand) | ~$2 | Runs a few hours/month |
| DynamoDB (on-demand) | ~$0 | Free tier: 25 GB + 25 WCU/RCU |
| ElastiCache (cache.t3.micro) | ~$12 | Single node, Redis 7 |
| S3 + data transfer | ~$1 | Minimal storage |
| Cognito | $0 | Free < 50K MAU |
| Bedrock KB (OpenSearch Serverless) | ~$7 | Minimum OCU charge |
| ALB | ~$16 | Hourly charge + LCU |
| CloudWatch Logs | ~$2 | 7-day retention, low volume |
| Secrets Manager | ~$2 | 4 secrets × $0.40 |
| ACM certificate | $0 | Free for public certs |
| **AWS subtotal** | **~$60** | |
| OpenAI API (LLM calls) | ~$20–50 | Depends on usage, controlled by budgets |
| **Total estimate** | **~$80–110** | |

> Compared to the original multi-env plan (~$170/month for dev alone), this MVP architecture
> saves ~65% by eliminating NAT Gateway ($35), DocumentDB/MongoDB ($50), WAF ($10),
> CloudFront ($5), and using DynamoDB on-demand + minimal Fargate tasks.

### 15.3 Cost Optimization Decisions

| Decision | Savings | Trade-off |
|---|---|---|
| No NAT Gateway → public subnets | $35/month | ECS tasks have public IPs + SGs (acceptable for internal MVP) |
| DynamoDB on-demand vs DocumentDB | $50/month | No MongoDB query language; learn DynamoDB patterns |
| cache.t3.micro vs larger Redis | $20/month | 0.5 GB RAM limit; sufficient for MVP queue/cache loads |
| No WAF | $10/month | Add in hardening phase post-MVP |
| No CloudFront for API | $5/month | ALB serves API directly; add CDN if needed |
| 7-day log retention | $5/month | Short debug window; increase post-MVP |
| Shared IAM task role | $0 | Less granular permissions; separate per-service post-MVP |
| Single AZ for ElastiCache | $12/month | No HA; add replica post-MVP |

---

## 16. Risk Register & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Manual start/stop becomes a UX bottleneck | Medium | Medium | Auto-approve user's own chat/journey runs; manual only for admin/bulk. Batch approve for ingestion windows. |
| R2 | Content quality / LLM hallucinations | High | High | Strict citations from KB; disallow unsourced claims; evaluator checks; store retrieved passages alongside outputs. |
| R3 | SSO domain restriction bypass | Low | High | Enforce at Cognito IdP level AND app-level email check. Regular audit of user list. |
| R4 | Cost drift from LLM usage | Medium | High | Per-run budgets, daily cost alarms via CloudWatch, concurrency limits, model routing rules, admin cost dashboard. |
| R5 | Data privacy / prompt leakage | Medium | High | Redaction helpers, hash prompts in audit logs, avoid storing raw prompts, structured outputs only, encryption at rest. |
| R6 | Bedrock KB retrieval quality | Medium | Medium | Tune chunking strategy, embedding model selection, retrieval filters. A/B test with different configurations. |
| R7 | Pipeline complexity → slow delivery | Medium | Medium | Phase-gated delivery with clear exit criteria. MVP first, iterate. |
| R8 | DynamoDB access pattern limitations | Medium | Medium | Multi-table design mitigates single-table complexity. GSIs cover all known access patterns. Add GSIs as needed (online, no downtime). |
| R9 | OpenAI API outage | Medium | Medium | Configurable model switch to Bedrock models. Graceful degradation in UI. |
| R10 | Low user adoption | Medium | High | L0 steps designed to be quick wins. Track weekly active users. Feedback loops in Phase 5. |
| R11 | MVP single-env availability | Medium | Low | Acceptable for internal tool with ~50 users. No SLA. DynamoDB + ECS self-heal. Add HA post-MVP. |
| R12 | Public subnet exposure (no NAT) | Low | Medium | Restrictive security groups. ECS tasks only accept traffic from ALB SG. No SSH. Add private subnets post-MVP. |

---

## 17. Immediate Next Actions

### Week 1 — Day 1–3

| # | Action | Owner | Output |
|---|---|---|---|
| 1 | Lock pilot roles: Engineering, PM, Design, HR, Finance, Sales | Product | Approved role list |
| 2 | Define L0–L2 KPI rubrics for each role | Product | KPI rubric spreadsheet |
| 3 | Decide: SPA vs SSR for Svelte | Engineering | ADR-001 |
| 4 | Decide: KB chat generation model (OpenAI vs Bedrock) | Engineering | ADR-003 |

### Week 1 — Day 3–5

| # | Action | Owner | Output |
|---|---|---|---|
| 5 | Create GitLab repo with full directory structure | Engineering | Repository with README |
| 6 | Initialize monorepo (pnpm workspaces) | Engineering | Working `pnpm install` from root |
| 7 | Set up ESLint + Prettier + TypeScript configs | Engineering | Shared configs, lint passes |
| 8 | Implement `packages/shared` with all TypeScript types + Zod schemas | Engineering | Importable shared package |

### Week 2

| # | Action | Owner | Output |
|---|---|---|---|
| 9 | Implement RunRequest/Approval/Execution schema + state machine | Engineering | DynamoDB repository + state transitions + tests |
| 10 | Create docker-compose.yml for local dev (DynamoDB Local + Redis) | Engineering | `docker compose up` works |
| 11 | Scaffold NestJS API with health endpoint | Engineering | `GET /health` returns 200 |
| 12 | Scaffold SvelteKit app with Tailwind | Engineering | `pnpm dev` serves Svelte app |
| 13 | Create UX wireframes for all screens | Design | Figma / wireframe file |
| 14 | Begin Terraform: networking + data modules | Engineering | VPC + DynamoDB tables deployable |

### Priority Order for Implementation

```
1. packages/shared (types + schemas)          ← Everything depends on this
2. RunRequest state machine                   ← Core control mechanism
3. API scaffold + auth middleware             ← Enables frontend work
4. Svelte scaffold + auth flow                ← Enables UX validation
5. Terraform networking + data + compute      ← Enables deployment
6. KB builder pipeline (crawl → summarize)    ← Core value delivery
7. Bedrock KB integration                     ← Enables chat + personalization
8. KB chat UI                                 ← First user-facing feature
9. Personalization agent                      ← Key differentiator
10. Hardening + rollout                       ← MVP readiness
```

---

## 18. Appendix — Epic & Issue Breakdown

### Epic Structure (GitLab)

```
Epic 1: Product & Journey Design
├── Issue 1.1: Define journey level taxonomy (L0–L4)
├── Issue 1.2: Define competency areas per role
├── Issue 1.3: Create KPI rubric for L0–L2
├── Issue 1.4: Design step template schema
├── Issue 1.5: Author baseline journey for Engineering role
├── Issue 1.6: Author baseline journey for PM role
├── Issue 1.7: Author baseline journey for Design role
├── Issue 1.8: Author baseline journey for HR role
├── Issue 1.9: Author baseline journey for Finance role
├── Issue 1.10: Author baseline journey for Sales role
└── Issue 1.11: UX wireframes for all screens

Epic 2: Authentication & Authorization
├── Issue 2.1: Terraform Cognito module (User Pool + Google IdP)
├── Issue 2.2: API auth middleware (JWT validation + domain check)
├── Issue 2.3: API RBAC middleware (employee vs admin)
├── Issue 2.4: Svelte login page + Cognito redirect
├── Issue 2.5: Svelte callback handler + session management
├── Issue 2.6: Token refresh flow
└── Issue 2.7: Domain restriction integration tests

Epic 3: Core Data Model & API
├── Issue 3.1: Shared package — TypeScript types
├── Issue 3.2: Shared package — Zod validation schemas
├── Issue 3.3: DynamoDB repository layer — all tables
├── Issue 3.4: DynamoDB table + GSI definitions (Terraform)
├── Issue 3.5: API — User CRUD endpoints
├── Issue 3.6: API — Journey CRUD endpoints
├── Issue 3.7: API — Step CRUD endpoints
├── Issue 3.8: API — KPI endpoints
├── Issue 3.9: API — Evidence upload endpoints (S3 integration)
├── Issue 3.10: API — Run Request endpoints
├── Issue 3.11: API — Admin endpoints
├── Issue 3.12: API — Event tracking middleware
├── Issue 3.13: OpenAPI spec generation
├── Issue 3.14: Seed script — baseline data
└── Issue 3.15: API — Unit + integration tests (≥80% coverage)

Epic 4: Run Control System (Manual Start/Stop)
├── Issue 4.1: RunRequest state machine implementation
├── Issue 4.2: Approval gate (auto-approve + admin approval)
├── Issue 4.3: BullMQ queue setup (summarization, personalization, kb-chat)
├── Issue 4.4: Worker execution engine (picks APPROVED jobs only)
├── Issue 4.5: Cancellation protocol (CANCEL_REQUESTED handling)
├── Issue 4.6: Budget enforcement (token/time/cost limits)
├── Issue 4.7: Concurrency controls (ElastiCache Redis atomic counters)
├── Issue 4.8: Audit logging (immutable append-only)
├── Issue 4.9: Svelte — Run control button component
├── Issue 4.10: Svelte — Admin run queue page
└── Issue 4.11: Run control integration tests

Epic 5: Knowledge Base Builder
├── Issue 5.1: Crawler — HTTP fetch with robots.txt respect
├── Issue 5.2: Crawler — S3 raw storage
├── Issue 5.3: Crawler — Seed configuration (JSON + admin editable)
├── Issue 5.4: Extractor — Readability parse + boilerplate removal
├── Issue 5.5: Deduplicator — SHA-256 hash + simhash
├── Issue 5.6: Quality filter — Scoring algorithm
├── Issue 5.7: Summarizer — OpenAI integration + prompt template
├── Issue 5.8: Summarizer — JSON output validation
├── Issue 5.9: Bedrock KB — S3 data source setup
├── Issue 5.10: Bedrock KB — Ingestion trigger + sync
├── Issue 5.11: Pipeline orchestrator — Step coordination
├── Issue 5.12: Pipeline — Idempotency + resume capability
├── Issue 5.13: Admin UI — Ingestion start/stop controls
├── Issue 5.14: Admin UI — Candidate review + approve/reject
├── Issue 5.15: Admin UI — Pipeline status dashboard
└── Issue 5.16: KB builder — Unit + integration tests

Epic 6: NotebookLM-like KB Chat
├── Issue 6.1: API — KB query endpoint (Bedrock retrieval)
├── Issue 6.2: Worker — KB chat worker (retrieval + generation)
├── Issue 6.3: Model switch — OpenAI vs Bedrock (configurable)
├── Issue 6.4: Citation generation + source attribution
├── Issue 6.5: Svelte — Chat UI component (single input)
├── Issue 6.6: Svelte — Chat message display with citations
├── Issue 6.7: Svelte — Run controls in chat (Start/Stop)
├── Issue 6.8: Svelte — Token/cost display per message
├── Issue 6.9: Chat history persistence
└── Issue 6.10: KB chat — Integration tests

Epic 7: Personalization Agent
├── Issue 7.1: Svelte — Onboarding intake flow (multi-step form)
├── Issue 7.2: Retrieval strategy — Profile-based KB query with filters
├── Issue 7.3: Generation prompt template design
├── Issue 7.4: OpenAI structured output parsing (Journey JSON)
├── Issue 7.5: Evaluator — Measurability check
├── Issue 7.6: Evaluator — Completeness check
├── Issue 7.7: Evaluator — Safety + policy check
├── Issue 7.8: Evaluator — Citation verification
├── Issue 7.9: Journey storage + versioning
├── Issue 7.10: Svelte — Journey dashboard (levels, steps, progress)
├── Issue 7.11: Svelte — Step detail page (task, evidence, KPI)
├── Issue 7.12: Svelte — Evidence upload component
├── Issue 7.13: Svelte — KPI progress widgets + charts
├── Issue 7.14: Svelte — Regenerate + Refine controls
├── Issue 7.15: Worker — Personalization worker
└── Issue 7.16: Personalization — Integration tests

Epic 8: Infrastructure & DevOps
├── Issue 8.1: Terraform — Networking module (VPC, public subnets, IGW)
├── Issue 8.2: Terraform — Security module (IAM references, SGs)
├── Issue 8.3: Terraform — Compute module (ECS Fargate, ALB, ACM)
├── Issue 8.4: Terraform — Data module (DynamoDB, ElastiCache, S3)
├── Issue 8.5: Terraform — Cognito module
├── Issue 8.6: Terraform — Bedrock module
├── Issue 8.7: Terraform — Observability module (logs, basic alarms)
├── Issue 8.8: Terraform — S3 state backend setup
├── Issue 8.9: GitLab CI — Lint + test stages
├── Issue 8.10: GitLab CI — Build + package stages
├── Issue 8.11: GitLab CI — Security scanning stages
├── Issue 8.12: GitLab CI — Terraform plan/apply stages
├── Issue 8.13: GitLab CI — Deploy + smoke stages
├── Issue 8.14: GitLab CI — OIDC → AWS role assumption
├── Issue 8.15: Dockerfiles for all 3 services
├── Issue 8.16: docker-compose.yml for local dev (DynamoDB Local + Redis)
└── Issue 8.17: Runbook — Deploy and rollback

Epic 9: Hardening & Rollout
├── Issue 9.1: Security review (auth, RBAC, input validation)
├── Issue 9.2: Rate limiting tuning
├── Issue 9.3: DynamoDB backup verification (PITR)
├── Issue 9.4: Cost monitoring + billing alarm
├── Issue 9.5: Content governance review
├── Issue 9.6: Admin analytics dashboard
├── Issue 9.7: Pilot group selection + onboarding
├── Issue 9.8: Pilot feedback collection + analysis
├── Issue 9.9: Critical feedback fixes
└── Issue 9.10: Org-wide launch preparation

Total: 9 Epics, ~83 Issues
```

### Issue Template

Each issue should follow this format:

```markdown
## Summary
[One sentence describing what this issue delivers]

## Acceptance Criteria
- [ ] [Specific, testable criterion 1]
- [ ] [Specific, testable criterion 2]
- [ ] [Specific, testable criterion 3]

## Technical Notes
[Implementation guidance, dependencies, decisions]

## Dependencies
- Blocked by: #[issue-number]
- Blocks: #[issue-number]

## Estimate
- T-shirt size: S / M / L / XL
- Story points: [number]
```

---

## Appendix: Architecture Decision Records (ADR) Stubs

### ADR-001: Frontend Rendering Strategy

- **Status**: PENDING
- **Decision**: Static SPA (adapter-static) vs SSR (adapter-node)
- **Recommendation**: Static SPA — simpler hosting (S3 + CloudFront), all data is authenticated anyway, no SEO requirement.

### ADR-002: Manual LLM Control Design

- **Status**: ACCEPTED
- **Decision**: RunRequest → Approval → Execution state machine
- **Rationale**: Provides deterministic, auditable, budget-controlled LLM usage with true manual start/stop capability.

### ADR-003: KB Chat Generation Model

- **Status**: PENDING
- **Decision**: OpenAI only vs Bedrock model only vs configurable switch
- **Recommendation**: Configurable switch — start with OpenAI (better generation quality), add Bedrock as fallback.

### ADR-004: Auth Strategy

- **Status**: ACCEPTED
- **Decision**: Amazon Cognito with Google Workspace federation
- **Rationale**: Managed service, native Google IdP support, domain restriction capability, JWT issuance for API auth.

### ADR-005: Database Choice

- **Status**: ACCEPTED
- **Decision**: Amazon DynamoDB (on-demand billing)
- **Rationale**: Fully managed, zero-ops, pay-per-request pricing ideal for MVP with unpredictable/low traffic. Free tier covers 25 GB + 25 WCU/RCU. Eliminates ~$50/month DocumentDB cost. Multi-table design for simplicity. Trade-off: no ad-hoc query language (must design access patterns upfront).

### ADR-006: Monorepo Strategy

- **Status**: ACCEPTED
- **Decision**: pnpm workspaces
- **Rationale**: Faster installs, strict dependency management, good monorepo support.

### ADR-007: MVP Single Environment

- **Status**: ACCEPTED
- **Decision**: Single "mvp" environment instead of dev/stage/prod
- **Rationale**: Reduces infra cost by ~65%, eliminates environment drift, simplifies CI/CD. Acceptable for internal tool with ~50 mito.hu users. Multi-env can be added post-validation.

### ADR-008: Cost-Optimized Networking (No NAT Gateway)

- **Status**: ACCEPTED
- **Decision**: Public subnets only, no NAT Gateway
- **Rationale**: Saves $35/month. ECS tasks in public subnets with restrictive security groups. DynamoDB and S3 accessed via VPC endpoints (free). ElastiCache in same VPC. Acceptable risk for internal MVP.

---

*End of Implementation Plan*
