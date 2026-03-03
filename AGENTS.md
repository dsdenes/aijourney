# AGENTS.md — Operating Guide for AI Agents in This Repository

> **Repository**: `https://github.com/dsdenes/aijourney` (SSH: `git@github.com:dsdenes/aijourney.git`)
> **Deployment**: Self-hosted on Scaleway (`root@51.15.108.144`) at `https://ai.1p.hu`
> **AWS Account**: `006207983055` (alias: `mito815`) — used for Cognito auth only
> **Region**: `eu-central-1`

---

## Table of Contents

1. [Repository Overview](#1-repository-overview)
2. [Environment & Authentication](#2-environment--authentication)
3. [Project Structure Conventions](#3-project-structure-conventions)
4. [Git Workflow](#4-git-workflow)
5. [AWS Operations](#5-aws-operations)
6. [GitHub Operations](#6-github-operations)
7. [Development Setup](#7-development-setup)
8. [Service Architecture](#8-service-architecture)
9. [Coding Standards](#9-coding-standards)
10. [Testing Strategy](#10-testing-strategy)
11. [Terraform / Infrastructure](#11-terraform--infrastructure)
12. [CI/CD Pipeline](#12-cicd-pipeline)
13. [Secrets & Sensitive Data](#13-secrets--sensitive-data)
14. [LLM Run Control System](#14-llm-run-control-system)
15. [Common Tasks & Recipes](#15-common-tasks--recipes)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Repository Overview

This is a monorepo for the **Mito AI Journey** platform — a Svelte web app + Node.js backend where `mito.hu` employees receive personalized, measurable AI experimentation journeys.

### Mandatory Guide Selection Rule

Before starting any implementation, debugging, review, or operational task, agents **must first read** `guides/index.md` to determine which task-specific guides apply.

Execution order is mandatory:
1. Read `guides/index.md`
2. Identify relevant guide(s) for the current task
3. Read those guide file(s) completely
4. Only then plan or execute changes

If a guide conflicts with default behavior, follow the guide selected via `guides/index.md`.

### Key Documents

| File | Purpose |
|---|---|
| `IMPLEMENTATION_PLAN.md` | Full architecture, data models, milestones, epic breakdown |
| `AGENTS.md` | This file — how to operate in this repo |
| `docs/api-spec.yaml` | OpenAPI 3.1 specification (when created) |
| `docs/architecture-decision-records/` | ADRs for key technical decisions |
| `docs/runbooks/` | Operational runbooks |

### Tech Stack Summary

| Layer | Technology |
|---|---|
| Frontend | SvelteKit (Svelte 5) + Tailwind CSS v4 + TypeScript |
| Backend API | NestJS + TypeScript + OpenTelemetry |
| Worker/Orchestration | BullMQ + ElastiCache (Redis) |
| KB Builder | Node.js pipeline + OpenAI + Bedrock |
| Database | DynamoDB (on-demand) |
| Cache/Queue | ElastiCache (Redis 7) |
| Auth | Amazon Cognito (Google Workspace SSO, mito.hu only) |
| RAG Storage | Amazon Bedrock Knowledge Bases |
| Object Storage | Amazon S3 |
| Compute | Docker Compose on Scaleway (self-hosted) |
| IaC | Docker Compose (production: `docker-compose.server.yml`) |
| CI/CD | GitHub Actions (self-hosted runner) |
| LLM | OpenAI API (primary) — **mandatory model: `gpt-5-mini`**; Bedrock models (configurable fallback) |

---

## 2. Environment & Authentication

### AWS CLI

**Profile**: `mito815`

```bash
# Always use this profile for AWS operations
export AWS_PROFILE=mito815

# Verify identity
aws sts get-caller-identity --no-cli-pager

# Expected output:
# Account: 006207983055
# Arn: arn:aws:iam::006207983055:user/d.pal+aws-mid-dev-815labs@mito.hu
# Region: eu-central-1
```

**IAM permissions**: PowerUser policy — full access to all AWS services EXCEPT:
- **Denied**: Billing, budgets, cost explorer, pricing, account management
- **Denied**: IAM user/group/role/policy creation and management (create, delete, attach, detach)
- **Allowed**: IAM self-management (access keys, password, MFA)

**Implications for Terraform**:
- Cannot create IAM roles/policies directly. These must be:
  - Pre-created by an admin (request from `fmile` — Owner, access_level 50), OR
  - Created via a separate privileged pipeline/account
- All other resources (ECS, S3, Cognito, Bedrock, VPC, etc.) can be created directly
- **Always add `--no-cli-pager` to AWS CLI commands** to avoid interactive pager

### GitHub

**Repository**: `https://github.com/dsdenes/aijourney`

```bash
# SSH clone
git clone git@github.com:dsdenes/aijourney.git

# GitHub CLI
gh repo view dsdenes/aijourney
gh pr list
gh pr create --base main --title "feat(scope): description"
```

**Collaborators**: `dsdenes` (owner)

### Node.js / Package Managers

```bash
node --version   # v24.12.0
npm --version    # 11.6.2
pnpm --version   # 9.15.4  (PREFERRED — use pnpm for this project)
```

### Other Tools Available

```bash
docker --version     # 28.3.0
redis-cli            # available
gh --version         # GitHub CLI
```

**Not installed** (install when needed):
- `playwright` — install via `npx playwright install`

---

## 3. Project Structure Conventions

### Directory Layout

```
aijourney/
├── apps/
│   └── web/                    # SvelteKit frontend
├── services/
│   ├── api/                    # NestJS REST API
│   ├── worker/                 # BullMQ orchestration workers
│   └── kb-builder/             # Knowledge base pipeline
├── packages/
│   └── shared/                 # Shared types, schemas, utilities
├── infra/
│   └── terraform/              # IaC
│       ├── modules/            # Reusable modules
│       ├── main.tf             # Root composition (single MVP env)
│       ├── variables.tf
│       └── backend.tf
├── docs/                       # Documentation
├── scripts/                    # Dev/ops scripts
├── .github/workflows/          # GitHub Actions CI/CD
├── docker-compose.server.yml   # Production deployment (Scaleway)
├── pnpm-workspace.yaml         # Monorepo workspace config
├── package.json                # Root package.json
├── IMPLEMENTATION_PLAN.md      # Detailed implementation plan
└── AGENTS.md                   # This file
```

### Naming Conventions

| Entity | Convention | Example |
|---|---|---|
| Files | kebab-case | `run-request.ts`, `quality-filter.ts` |
| Directories | kebab-case | `kb-builder/`, `run-logs/` |
| TypeScript interfaces | PascalCase | `RunRequest`, `JourneyStep` |
| TypeScript types | PascalCase | `RunStatus`, `KPICategory` |
| Constants | UPPER_SNAKE_CASE | `MAX_CONCURRENT_RUNS`, `DEFAULT_BUDGETS` |
| Functions | camelCase | `createRunRequest()`, `validateDomain()` |
| Environment variables | UPPER_SNAKE_CASE | `DYNAMODB_ENDPOINT`, `REDIS_URL` |
| API routes | kebab-case plural nouns | `/api/run-requests`, `/api/journeys` |
| DynamoDB tables | snake_case plural | `run_requests`, `run_logs` |
| Terraform resources | snake_case | `aws_ecs_service.api` |
| Terraform modules | kebab-case dirs | `modules/kb-builder/` |
| Git branches | type/description | `feat/kb-crawler`, `fix/auth-domain-check` |

### File Organization Rules

1. **One export per file** for models, services, and route handlers
2. **Index files** (`index.ts`) only for re-exports from `packages/shared`
3. **Co-locate tests** next to source: `foo.ts` → `foo.test.ts`
4. **Zod schemas** live in `packages/shared/src/schemas/` and are the single source of truth for validation
5. **TypeScript types** are inferred from Zod schemas where possible (`z.infer<typeof Schema>`)

---

## 4. Git Workflow

### Branch Strategy

```
main (MVP deployment)
├── feat/kb-crawler
├── feat/auth-sso
├── fix/run-budget-check
└── ...
```

| Branch | Purpose | Deploys To | Merge Strategy |
|---|---|---|---|
| `main` | MVP deployment | mvp (auto) | Squash merge from feature |
| `feat/*` | Feature work | — | Squash merge to main |
| `fix/*` | Bug fixes | — | Squash merge to main |
| `infra/*` | Terraform changes | — | Squash merge to main |

### Commit Message Format

```
type(scope): description

# Types: feat, fix, refactor, docs, test, infra, ci, chore
# Scopes: web, api, worker, kb-builder, shared, terraform, ci

# Examples:
feat(api): add run-request state machine
fix(worker): check cancel flag between LLM chunks
infra(terraform): add cognito user pool module
docs: update AGENTS.md with terraform IAM notes
test(shared): add zod schema validation tests
```

### Pull Request Process

1. Create feature branch from `main`
2. Implement + test locally
3. Push to GitHub, create PR targeting `main`
4. CI pipeline runs (lint → test → build via GitHub Actions)
5. Review (at least 1 approval)
6. Squash merge to `main`
7. Auto-deploy to Scaleway server via self-hosted runner

### Git Commands

```bash
# Clone (first time)
git clone git@github.com:dsdenes/aijourney.git
cd aijourney

# Create feature branch
git checkout main
git pull origin main
git checkout -b feat/my-feature

# Push and create PR
git push -u origin feat/my-feature
# Then create PR via GitHub UI or:
gh pr create --base main --title "feat(scope): description"
```

---

## 5. AWS Operations

### Profile Must Always Be Set

**Every AWS CLI command must use the `mito815` profile.** Either:

```bash
# Option A: Set per-command
AWS_PROFILE=mito815 aws <command> --no-cli-pager

# Option B: Export for session
export AWS_PROFILE=mito815
```

### Available AWS Services (Confirmed Working)

| Service | CLI Namespace | Status |
|---|---|---|
| IAM (read-only + self) | `aws iam` | ✅ Read-only (no create/delete) |
| S3 | `aws s3` / `aws s3api` | ✅ Full access |
| ECS | `aws ecs` | ✅ Full access |
| ECR | `aws ecr` | ✅ Full access |
| EC2/VPC | `aws ec2` | ✅ Full access |
| Bedrock | `aws bedrock` | ✅ Full access (38 models available) |
| Bedrock Agent (KB) | `aws bedrock-agent` | ✅ Full access |
| Cognito | `aws cognito-idp` | ✅ Full access |
| ElastiCache | `aws elasticache` | ✅ Full access |
| CloudWatch | `aws cloudwatch` / `aws logs` | ✅ Full access |
| Route53 | `aws route53` | ✅ Full access |
| WAFv2 | `aws wafv2` | ✅ Full access |
| Secrets Manager | `aws secretsmanager` | ✅ Full access |
| CloudFront | `aws cloudfront` | ✅ Full access |
| ACM | `aws acm` | ✅ Full access |

### IAM Limitation — Critical

**You CANNOT create IAM roles, policies, groups, or users.** This means:

1. **Terraform IAM resources** must either:
   - Be pre-created by an admin (`fmile`) and referenced by ARN
   - Use a separate privileged deployment pipeline
   - Be requested via a ticket/conversation with the Owner

2. **Resources that need IAM roles** (ECS task roles, Bedrock KB roles, Cognito, etc.) require coordination with the Owner before Terraform can provision them.

3. **Workaround for development**: Use the existing IAM user's credentials directly for local dev/testing, and plan IAM provisioning as a separate admin task.

### Available Bedrock Models (Key Ones)

| Model | Provider | Use Case |
|---|---|---|
| `anthropic.claude-sonnet-4-6` | Anthropic | KB chat generation (option) |
| `anthropic.claude-opus-4-6-v1` | Anthropic | Complex generation |
| `anthropic.claude-haiku-4-5-20251001-v1:0` | Anthropic | Fast/cheap tasks |
| `amazon.titan-embed-text-v2:0` | Amazon | Embeddings for Bedrock KB |
| `cohere.embed-english-v3` | Cohere | Alternative embeddings |
| `amazon.nova-pro-v1:0` | Amazon | Alternative generation |

### AWS Region

All resources **must** be in `eu-central-1` (Frankfurt) unless there's a specific service availability reason to use another region.

### S3 Existing Buckets

```
815-ai-tools-fare-finder
815-ai-tools-fare-finder-ca99bc94
815-ai-tools-terraform-tf-state      ← Terraform state bucket exists
```

The existing Terraform state bucket (`815-ai-tools-terraform-tf-state`) may be reusable for this project's state with a different key prefix.

---

## 6. GitHub Operations

### GitHub CLI

```bash
# List PRs
gh pr list

# Create PR
gh pr create --base main --title "feat(scope): description"

# View repo
gh repo view dsdenes/aijourney

# Trigger workflow manually
gh workflow run deploy.yml
```

### GitHub Actions Secrets

These are configured in GitHub repository settings (Settings → Secrets → Actions):

| Secret | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | AWS IAM access key |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key |
| `OPENAI_API_KEY` | OpenAI API key |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `COGNITO_CLIENT_ID` | Cognito App Client ID |
| `COGNITO_CLIENT_SECRET` | Cognito App Client Secret |
| `COGNITO_DOMAIN` | Cognito domain URL |
| `COGNITO_ISSUER` | Cognito issuer URL |

### Self-Hosted Runner

The GitHub Actions self-hosted runner is installed on the Scaleway server:

- **Location**: `/opt/actions-runner-aijourney/`
- **Service**: `actions.runner.dsdenes-aijourney.scw-aijourney-runner`
- **Labels**: `self-hosted`, `linux`, `x64`, `aijourney`
- **User**: `gha` (uid 1001, in docker group)

---

## 7. Development Setup

### Prerequisites

```bash
# Verify all tools
node --version     # v20+ required (v24.12.0 available)
pnpm --version     # v9+ required (9.15.4 available)
docker --version   # v24+ required (28.3.0 available)
terraform --version # v1.5+ (1.5.7 available, consider upgrading)
# mongosh not needed (using DynamoDB)
```

### Running the Project

Three modes are available:

| Command | Mode | Use Case |
|---|---|---|
| `pnpm start` | **Docker (production-like)** | All services in Docker containers. Builds images, starts everything. |
| `pnpm stop` | Stop Docker | Tears down all containers from `pnpm start`. |
| `pnpm watch` | **Dev with hot-reload** | Infra in Docker, app services run locally with file watchers. |

#### `pnpm start` / `pnpm stop` — Full Docker

Runs the entire stack in Docker containers (builds images, serves the SvelteKit frontend via nginx):

```bash
pnpm start          # docker compose up -d --build
# App at http://localhost:5173 — API at http://localhost:3000
pnpm stop           # docker compose down
```

#### `pnpm watch` — Development with Hot-Reload

Starts infrastructure (DynamoDB Local + Redis) in Docker, then runs all application services locally with file watchers for instant rebuilds:

```bash
pnpm watch
# Equivalent to:
#   1. docker compose up -d --wait dynamodb-local redis
#   2. pnpm run seed:db
#   3. pnpm --filter @aijourney/shared build
#   4. pnpm -r --parallel dev
```

This gives you:
- **SvelteKit** HMR on http://localhost:5173 (Vite dev server)
- **NestJS API** auto-restart on http://localhost:3000 (`nest start --watch`)
- **Worker** auto-restart (`tsx watch`)
- **KB Builder** auto-restart on http://localhost:3002 (`tsx watch`)
- **Shared package** type-checked in watch mode (`tsc --watch`)

To stop: `Ctrl+C` to kill the watchers, then `docker compose down dynamodb-local redis` to stop infra.

### Initial Setup

```bash
# 1. Clone
git clone git@github.com:dsdenes/aijourney.git
cd aijourney

# 2. Install dependencies
pnpm install

# 3. Set environment variables
cp .env.example .env
# Edit .env with local values

# 4. Start developing (pick one)
pnpm watch          # Dev mode with hot-reload (recommended)
pnpm start          # Full Docker mode
```

### Environment Variables

```bash
# .env (local development)
NODE_ENV=development
PORT=3000

# DynamoDB (local development)
DYNAMODB_ENDPOINT=http://localhost:8000
AWS_REGION=eu-central-1

# ElastiCache Redis (local: plain Redis)
REDIS_URL=redis://localhost:6379

# AWS (use mito815 profile credentials)
AWS_PROFILE=mito815
AWS_REGION=eu-central-1

# OpenAI
OPENAI_API_KEY=sk-...

# Cognito (fill after Terraform creates pool)
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=
COGNITO_CLIENT_SECRET=
COGNITO_DOMAIN=

# App
APP_URL=http://localhost:5173
API_URL=http://localhost:3000
ALLOWED_EMAIL_DOMAIN=mito.hu
```

---

## 8. Service Architecture

### Service Communication Map

```
Client (Browser)
    │
    ├──► apps/web (SvelteKit, port 5173)
    │       │
    │       └──► services/api (NestJS, port 3000)
    │               │
    │               ├──► DynamoDB (AWS SDK / local:8000)
    │               ├──► ElastiCache Redis (port 6379) — session, rate limits
    │               └──► BullMQ queues (via ElastiCache Redis)
    │                       │
    │                       └──► services/worker (BullMQ consumers)
    │                               │
    │                               ├──► OpenAI API
    │                               ├──► Bedrock KB (retrieval)
    │                               ├──► DynamoDB (results)
    │                               └──► ElastiCache Redis (run state)
    │
    └──► services/kb-builder (triggered by admin via API)
            │
            ├──► Web (crawl targets)
            ├──► S3 (raw content)
            ├──► OpenAI API (summarization)
            ├──► DynamoDB (articles, summaries)
            └──► Bedrock KB (ingestion)
```

### Health Check Endpoints

| Service | Endpoint | Expected Response |
|---|---|---|
| API | `GET /api/health` | `200 { status: "ok", dynamodb: "connected" }` |
| Worker | Process keeps running, logs heartbeat | BullMQ worker active events |
| KB Builder | `GET /health` | `200 { status: "ok", pipeline: "idle" }` |

### Port Allocation (Local Dev)

| Service | Port |
|---|---|
| Svelte dev server | 5173 |
| API server | 3000 |
| DynamoDB Local | 8000 |
| Redis | 6379 |
| Bull Board (optional) | 3001 |

---

## 9. Coding Standards

### LLM Model Standards

**Mandatory OpenAI model: `gpt-5-mini`** — This is the only permitted OpenAI model in this codebase.

- **Never** use `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini`, or any other variant.
- All new code that calls the OpenAI Chat Completions API **must** use `model: "gpt-5-mini"`.
- This applies everywhere: services, workers, kb-builder, scripts, tests.
- Do not make model name configurable via env var unless a specific override is explicitly approved.

```typescript
// ✅ Correct — always use this
await openai.chat.completions.create({ model: "gpt-5-mini", ... });

// ❌ Forbidden — any other OpenAI chat model
await openai.chat.completions.create({ model: "gpt-4o-mini", ... });
```

> **Why `gpt-5-mini`?** It is OpenAI's current cost-efficient model ($0.25/M input, $2.00/M output), successor to o4-mini, with 400K context window and strong instruction-following — ideal for the AI Journey platform's use cases.

### gpt-5-mini API Constraints

`gpt-5-mini` is a **reasoning model** with specific API requirements that differ from GPT-4 series:

| Parameter | Requirement |
|---|---|
| `temperature` | ❌ NOT supported — omit entirely (only default `1` works) |
| `max_tokens` | ❌ NOT supported — use `max_completion_tokens` instead |
| `max_completion_tokens` | ✅ Required — covers BOTH reasoning tokens + visible output |

**Critical: Set `max_completion_tokens` generously.** Reasoning models consume many internal tokens before producing visible output. Minimum recommended values:

| Use Case | Minimum `max_completion_tokens` |
|---|---|
| Short JSON responses (lists, analysis) | 8000 |
| Long JSON responses (strategies, full content) | 16000 |
| Conversational/chat responses | 4000 |

```typescript
// ✅ Correct — reasoning model usage
await openai.chat.completions.create({
  model: "gpt-5-mini",
  messages: [...],
  max_completion_tokens: 8000,  // generous budget for reasoning + output
});

// ❌ Wrong — will produce empty content (all tokens consumed by internal reasoning)
await openai.chat.completions.create({
  model: "gpt-5-mini",
  messages: [...],
  temperature: 0.7,       // NOT supported
  max_completion_tokens: 800,  // too low — model can't output anything
});
```

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "target": "ES2022",
    "module": "ES2022"
  }
}
```

### ESLint Rules (Key)

- No `any` types (use `unknown` and narrow)
- No unused variables (prefix with `_` if intentionally unused)
- Consistent return types on exported functions
- No floating promises (must `await` or explicitly void)

### Patterns to Follow

**Error handling**: Use typed error classes, never throw raw strings.

```typescript
// ✅ Good
class RunBudgetExceededError extends AppError {
  constructor(runId: string, budget: number, actual: number) {
    super(`Run ${runId} exceeded budget: ${actual}/${budget} tokens`);
  }
}

// ❌ Bad
throw "budget exceeded";
throw new Error("something went wrong");
```

**API responses**: Always use consistent envelope.

```typescript
// Success
{ data: T, meta?: { page, total } }

// Error
{ error: { code: string, message: string, details?: unknown } }
```

**DynamoDB access**: Use the repository pattern with typed helpers. Never use the raw DynamoDB client directly in route handlers.

```typescript
// ✅ Repository pattern
const user = await userRepository.getById(id);

// ✅ Typed operations
await userRepository.update(id, { status: 'active', updatedAt: new Date().toISOString() });

// ❌ Never use raw client in business logic
// const result = await dynamoClient.send(new GetCommand({ ... }));
```

**Environment config**: Use a typed config module, never access `process.env` directly in business logic.

```typescript
// config.ts
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DYNAMODB_ENDPOINT: z.string().url().optional(),  // Only for local dev
  REDIS_URL: z.string().url(),
  // ...
});

export const config = envSchema.parse(process.env);
```

---

## 10. Testing Strategy

### Test Pyramid

| Layer | Tool | Location | Coverage Target |
|---|---|---|---|
| Unit | Vitest | `*.test.ts` next to source | 80% business logic |
| Integration | Vitest + testcontainers | `*.integration.test.ts` | Key flows |
| E2E | Playwright | `apps/web/tests/` | Critical paths |

### Running Tests

```bash
# All tests
pnpm test

# Specific workspace
pnpm --filter api test
pnpm --filter shared test
pnpm --filter web test

# With coverage
pnpm --filter api test -- --coverage

# Watch mode
pnpm --filter api test -- --watch

# E2E (requires services running)
pnpm --filter web test:e2e
```

### Test Naming Convention

```typescript
describe('RunRequestService', () => {
  describe('createRunRequest', () => {
    it('should create a PENDING run request with valid inputs', async () => {});
    it('should reject if user exceeds per-hour rate limit', async () => {});
    it('should auto-approve for user-initiated chat runs', async () => {});
  });
});
```

### Test Data

- Use factory functions (not fixtures) for test data
- Each test creates its own data (no shared mutable state)
- Use DynamoDB Local (via docker-compose) for unit and integration tests
- Use `@aws-sdk/client-dynamodb` with local endpoint for test table creation/cleanup

---

## 11. Terraform / Infrastructure

### Directory Structure

```
infra/terraform/
├── modules/
│   ├── networking/       # VPC, public subnets (no NAT — cost-effective MVP)
│   ├── security/         # Security groups, KMS (NOT IAM — admin required)
│   ├── compute/          # ECS Fargate cluster + services
│   ├── data/             # S3, DynamoDB tables, ElastiCache Redis
│   ├── cognito/          # User pool, Google IdP
│   ├── bedrock/          # Knowledge Base resources
│   └── observability/    # CloudWatch logs, metrics, alarms
├── main.tf               # Root composition (single MVP env)
├── variables.tf
└── backend.tf
```

### State Management

```hcl
# backend.tf — use existing Terraform state bucket
terraform {
  backend "s3" {
    bucket         = "815-ai-tools-terraform-tf-state"
    key            = "aijourney/mvp/terraform.tfstate"
    region         = "eu-central-1"
    encrypt        = true
    dynamodb_table = "terraform-lock"  # Create if not exists
  }
}
```

### Terraform Commands

```bash
# Always set AWS profile
export AWS_PROFILE=mito815

# Initialize
cd infra/terraform
terraform init

# Plan
terraform plan -out=plan.tfplan

# Apply (single MVP environment)
terraform apply plan.tfplan

# Destroy (careful!)
terraform plan -destroy -out=destroy.tfplan
terraform apply destroy.tfplan
```

### IAM Workaround

Since this IAM user cannot create IAM resources, use this approach:

1. Document all required IAM roles/policies in `infra/terraform/iam-requirements.md`
2. Request creation from admin (`fmile`)
3. Reference pre-created roles by ARN in Terraform:

```hcl
# Instead of creating:
# resource "aws_iam_role" "ecs_task" { ... }

# Reference pre-created:
data "aws_iam_role" "ecs_task" {
  name = "aijourney-ecs-task-role"
}
```

### Terraform Version Note

Current Terraform version is `1.5.7` (October 2023). Consider upgrading to `1.7+` for:
- `removed` blocks
- Better provider lock file handling
- Import blocks improvements

---

## 12. CI/CD Pipeline

### Pipeline Files

```
.github/workflows/ci.yml     # Lint + test + build (on PR and push to main)
.github/workflows/deploy.yml # Deploy to Scaleway (on push to main)
```

### CI Workflow (`ci.yml`)

Jobs (parallel where possible):
1. `lint` — ESLint
2. `test-shared` — Vitest (packages/shared)
3. `test-api` — Vitest (services/api) with DynamoDB Local + Redis service containers
4. `test-worker` — Vitest (services/worker)
5. `test-kb-builder` — Vitest (services/kb-builder)
6. `build-check` — Full Docker multi-stage build

### Deploy Workflow (`deploy.yml`)

- Triggered on push to `main`
- Runs on self-hosted runner (`labels: [self-hosted, linux, aijourney]`)
- Steps: git pull → write .env from secrets → docker compose build → docker compose up -d
- Deployment directory: `/opt/aijourney`

### Deployment Commands (Manual)

```bash
# On the Scaleway server:
cd /opt/aijourney
git pull
docker compose -f docker-compose.server.yml up -d --build
```

---

## 13. Secrets & Sensitive Data

### Rules

1. **NEVER** commit secrets, API keys, or credentials to the repository
2. **NEVER** log raw prompts, user data, or API keys
3. Store all secrets in **AWS Secrets Manager** (production) or `.env` (local dev only)
4. `.env` is in `.gitignore` — ALWAYS verify
5. Use **prompt hashing** (SHA-256) in audit logs, not raw prompt text
6. Mask sensitive fields in error logs

### Secret Inventory

| Secret | Local Dev | Production |
|---|---|---|
| OpenAI API key | `.env` | GitHub Actions secret + server `.env` |
| DynamoDB | N/A (DynamoDB Local) | DynamoDB Local in Docker |
| Cognito client secret | `.env` | GitHub Actions secret + server `.env` |
| AWS credentials | `~/.aws/credentials` (profile) | GitHub Actions secret + server `.env` |

### .gitignore Must Include

```
.env
.env.*
!.env.example
*.pem
*.key
terraform.tfvars
*.tfstate
*.tfstate.*
.terraform/
node_modules/
```

---

## 14. LLM Run Control System

### Core Principle

**Every LLM call must go through the RunRequest → Approval → Execution pipeline.** No ad-hoc LLM calls anywhere in the codebase.

### State Machine

```
PENDING → APPROVED → RUNNING → COMPLETED
                  ↘ REJECTED    ↘ FAILED
                              ↘ CANCEL_REQUESTED → CANCELLED
```

### Implementation Rules

1. **User clicks "Start"**: Creates RunRequest, auto-approved for user's own chat/journey runs
2. **Admin approval required for**: KB ingestion runs, bulk operations
3. **Workers only pick `APPROVED` jobs** from BullMQ queues
4. **Cancel check**: Before every LLM API call AND every 10 streaming chunks
5. **Budget enforcement**: Token count and cost checked after each LLM response
6. **Audit trail**: Every state transition logged to `run_logs` table (immutable)

### Adding a New LLM-Powered Feature

When adding any new feature that calls an LLM:

1. Define the `RunPurpose` type in `packages/shared`
2. Add default budget in `DEFAULT_BUDGETS`
3. Create a BullMQ queue in `services/worker`
4. Create a worker that:
   - Only processes `APPROVED` jobs
   - Checks cancel flag before each LLM call
   - Tracks token usage
   - Logs all events to `run_logs`
5. Add API endpoint to create RunRequest
6. Add UI controls (Start/Stop buttons)

---

## 15. Common Tasks & Recipes

### Create a New API Endpoint

```bash
# 1. Add Zod schema in packages/shared
# packages/shared/src/schemas/my-feature.ts

# 2. Create NestJS module in services/api
# services/api/src/my-feature/my-feature.module.ts
# services/api/src/my-feature/my-feature.controller.ts
# services/api/src/my-feature/my-feature.service.ts
# services/api/src/my-feature/my-feature.repository.ts

# 3. Register module in app.module.ts imports
# 4. Add @nestjs/swagger decorators for OpenAPI
# 5. Write tests
```

### Create a New Svelte Page

```bash
# 1. Create route directory
mkdir -p apps/web/src/routes/my-page

# 2. Create page
# apps/web/src/routes/my-page/+page.svelte

# 3. Add load function if needed
# apps/web/src/routes/my-page/+page.ts

# 4. Add to navigation
# 5. Write tests
```

### Add a New Terraform Resource

```bash
# 1. Add to appropriate module
# infra/terraform/modules/<module>/main.tf

# 2. Add variables
# infra/terraform/modules/<module>/variables.tf

# 3. Add outputs
# infra/terraform/modules/<module>/outputs.tf

# 4. Reference in root composition
# infra/terraform/main.tf

# 5. Plan and review
cd infra/terraform
terraform plan
```

### Deploy a Service Update

```bash
# Option 1: Push to main → automatic deploy via GitHub Actions

# Option 2: Manual deploy on server
ssh root@51.15.108.144
cd /opt/aijourney
git pull
docker compose -f docker-compose.server.yml up -d --build

# Option 3: Rebuild specific service only
docker compose -f docker-compose.server.yml up -d --build api
```

### Query DynamoDB Locally

```bash
# List tables
aws dynamodb list-tables --endpoint-url http://localhost:8000 --no-cli-pager

# Scan users table (dev only — avoid scan in production)
aws dynamodb scan --table-name users --endpoint-url http://localhost:8000 --no-cli-pager

# Query run requests by status
aws dynamodb query --table-name run_requests \
  --index-name status-createdAt-index \
  --key-condition-expression "#s = :status" \
  --expression-attribute-names '{"#s": "status"}' \
  --expression-attribute-values '{":status": {"S": "RUNNING"}}' \
  --endpoint-url http://localhost:8000 --no-cli-pager

# Get specific item
aws dynamodb get-item --table-name users \
  --key '{"id": {"S": "01HXYZ..."}}' \
  --endpoint-url http://localhost:8000 --no-cli-pager
```

### Check ElastiCache Redis / BullMQ Status

```bash
redis-cli

# Check queues
KEYS bull:*
LLEN bull:summarization:wait
LLEN bull:personalization:wait

# Check run state
GET runstate:<runRequestId>
GET runstate:active:count

# Check rate limits
GET ratelimit:global:runs
```

---

## 16. Troubleshooting

### AWS CLI Issues

| Problem | Solution |
|---|---|
| `Could not connect to endpoint URL` | Ensure `AWS_PROFILE=mito815` is set (default profile points to `local`) |
| `AccessDenied` on IAM operations | Expected — IAM create/modify is denied. Request from admin. |
| `ExpiredToken` | Re-authenticate: `aws configure` (for IAM user, keys don't expire unless rotated) |
| Interactive pager opens | Add `--no-cli-pager` flag to all commands |

### GitHub Issues

| Problem | Solution |
|---|---|
| `gh` uses wrong user | Ensure `GITHUB_TOKEN` env var is not set to a different user's PAT |
| SSH permission denied | Verify SSH key is added to GitHub profile |
| Push rejected by secret scanning | Remove secrets from code history with `git filter-repo` |

### Docker Issues

| Problem | Solution |
|---|---|
| DynamoDB Local won't start | Check if port 8000 is in use: `lsof -i :8000` |
| Redis connection refused | Ensure `docker compose up -d` ran successfully |
| Build fails | Clear Docker cache: `docker system prune` |

### Terraform Issues

| Problem | Solution |
|---|---|
| State lock | Check DynamoDB, or use `terraform force-unlock <ID>` |
| Provider version conflict | Run `terraform init -upgrade` |
| Can't create IAM resource | Expected — see Section 11 (IAM Workaround) |

---

## Appendix: Access Summary Reference

```
┌────────────────────────────────────────────────────────────┐
│                    ACCESS MATRIX                            │
├──────────────────┬─────────────────────────────────────────┤
│ AWS Account      │ 006207983055 (mito815)                  │
│ AWS User         │ d.pal+aws-mid-dev-815labs@mito.hu       │
│ AWS Profile      │ mito815                                 │
│ AWS Region       │ eu-central-1                            │
│ AWS Permissions  │ PowerUser (all except billing + IAM     │
│                  │ write)                                   │
├──────────────────┼─────────────────────────────────────────┤
│ GitHub Repo      │ https://github.com/dsdenes/aijourney    │
│ GitHub SSH       │ git@github.com:dsdenes/aijourney.git    │
│ GitHub User      │ dsdenes (owner)                          │
│ Server           │ root@51.15.108.144 (Scaleway)           │
│ Domain           │ https://ai.1p.hu                         │
│ Runner           │ scw-aijourney-runner (self-hosted)       │
│ Runner Path      │ /opt/actions-runner-aijourney/           │
│ Deploy Path      │ /opt/aijourney/                           │
├──────────────────┼─────────────────────────────────────────┤
│ Tools            │ node 24.12, pnpm 9.15, docker 28.3     │
│                  │ gh (GitHub CLI)                           │
├──────────────────┼─────────────────────────────────────────┤
│ LIMITATIONS      │                                         │
│ 1. IAM           │ Cannot create/modify IAM roles or       │
│                  │ policies — need admin (fmile)            │
│ 2. Billing       │ Cannot access billing/cost explorer     │
│ 3. Terraform     │ v1.5.7 is outdated (latest v1.14.5)    │
└──────────────────┴─────────────────────────────────────────┘
```

---

*Last verified: 2026-03-03*
