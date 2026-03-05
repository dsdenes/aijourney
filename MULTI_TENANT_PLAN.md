# Multi-Tenant Implementation Plan

> **Status**: Planning (not yet implemented)
> **Created**: 2026-03-04
> **Decisions**: See conversation record for Q&A that produced these choices

---

## Table of Contents

1. [Decisions & Constraints](#1-decisions--constraints)
2. [Current State Analysis](#2-current-state-analysis)
3. [Target Architecture](#3-target-architecture)
4. [Phase 1 — Data Model & Tenant Middleware](#phase-1--data-model--tenant-middleware)
5. [Phase 2 — Auth Overhaul & Invitations](#phase-2--auth-overhaul--invitations)
6. [Phase 3 — Per-Tenant RBAC](#phase-3--per-tenant-rbac)
7. [Phase 4 — Usage Quotas & Metering](#phase-4--usage-quotas--metering)
8. [Phase 5 — Stripe Billing](#phase-5--stripe-billing)
9. [Phase 6 — Super-Admin Panel](#phase-6--super-admin-panel)
10. [Phase 7 — Frontend Tenant Management](#phase-7--frontend-tenant-management)
11. [Migration Strategy](#migration-strategy)
12. [Testing Strategy](#testing-strategy)
13. [Rollout Plan](#rollout-plan)

---

## 1. Decisions & Constraints

| Decision           | Choice                                                          | Rationale                                                              |
| ------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Tenant definition  | **Company / Organization**                                      | Each org is an isolated workspace with multiple users                  |
| Data isolation     | **Shared DB + `tenantId` on every document**                    | Simplest; single DB, row-level filtering; good enough for <100 tenants |
| Auth / signup      | **Invite-only per tenant**                                      | Org admin sends email invites; invited users join on Google login      |
| Domain restriction | **Remove `@mito.hu` — any Google account**                      | Required for multi-tenant; any Google user can join if invited         |
| Billing provider   | **Stripe** (Checkout + Customer Portal)                         | Industry standard for SaaS                                             |
| Pricing model      | **Tiered plans + purchasable LLM call add-ons**                 | Free/Pro/Enterprise tiers; additional call packs buyable               |
| Quotas             | **LLM token/call limits per tenant per month**                  | Enforced before each LLM API call                                      |
| MVP scope          | Tenant isolation, per-tenant RBAC, billing, quotas, super-admin | No white-label branding in v1                                          |

---

## 2. Current State Analysis

### 2.1 MongoDB Collections (13 total)

| #   | Collection           | Has Repository                     | Active Usage                |
| --- | -------------------- | ---------------------------------- | --------------------------- |
| 1   | `users`              | `UsersRepository`                  | High — auth, profile, admin |
| 2   | `journeys`           | `JourneysRepository`               | Medium                      |
| 3   | `steps`              | _(none)_                           | Indexed only                |
| 4   | `kpis`               | _(none)_                           | Indexed only                |
| 5   | `evidence`           | _(none)_                           | Indexed only                |
| 6   | `run_requests`       | `RunsRepository`                   | Medium                      |
| 7   | `run_logs`           | _(none)_                           | Indexed only                |
| 8   | `agent_runs`         | `AgentRunsRepository` + KB Builder | High                        |
| 9   | `articles`           | KB Builder `article-repository.ts` | High                        |
| 10  | `summaries`          | KB Builder `summary-repository.ts` | High                        |
| 11  | `events`             | _(none)_                           | Indexed only                |
| 12  | `memory_facts`       | `MemoryRepository`                 | New                         |
| 13  | `memory_extractions` | `MemoryRepository`                 | New                         |

**Every one of these collections needs a `tenantId` field added.**

### 2.2 Repositories Requiring Changes

**API service** (`services/api/src/`):

- `users/users.repository.ts` — 7 methods (getById, getByEmail, getByGoogleId, create, update, list, count)
- `journeys/journeys.repository.ts` — CRUD methods
- `runs/runs.repository.ts` — CRUD + status queries
- `agent-runs/agent-runs.repository.ts` — CRUD + stats queries
- `memory/memory.repository.ts` — facts CRUD + extractions + global stats

**KB Builder service** (`services/kb-builder/src/`):

- `article-repository.ts` — CRUD + batch operations
- `summary-repository.ts` — CRUD + batch operations
- `agent-run-logger.ts` — logging agent runs

### 2.3 Auth (Single-Tenant)

- Hardcoded `@mito.hu` email validation in `createUserSchema`
- Hardcoded `DEFAULT_ADMINS` array in `auth.service.ts`
- Google OAuth via `POST /auth/token` code exchange
- JWT strategy validates Google `id_token` via JWKS
- `RolesGuard` checks flat `user.role` (`"employee" | "admin"`)
- No tenant context in any auth middleware or guard

### 2.4 Config

- `AppConfigService` validates: `MONGODB_URI`, `REDIS_URL`, `GOOGLE_CLIENT_ID/SECRET`, `APP_URL`, `API_URL`, `KB_BUILDER_URL`
- No Stripe keys, no tenant config
- LLM API keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROK_API_KEY`) passed via Docker env but not in Zod schema

### 2.5 Frontend Auth

- `auth.svelte.ts` store: `{ userId, email, name, role, token, onboardingComplete }`
- No `tenantId`, `orgRole`, or tenant context in frontend state
- API client sends `Authorization: Bearer <google_id_token>`

---

## 3. Target Architecture

### 3.1 New Data Model Overview

```
┌──────────────────────────────────────────────────┐
│                    tenants                         │
│  id, name, slug, plan, stripeCustomerId,          │
│  stripeSubscriptionId, settings, quotas,          │
│  createdAt, updatedAt                              │
└──────────┬───────────────────────────────────────┘
           │ 1:N
           ▼
┌──────────────────────────────────────────────────┐
│                    users                           │
│  + tenantId, orgRole ("owner"|"admin"|"member")   │
│  - email domain restriction removed               │
│  - role becomes: "superadmin"|"user"               │
└──────────┬───────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────┐
│              invitations                           │
│  id, tenantId, email, orgRole, invitedBy,         │
│  status, token, expiresAt, createdAt              │
└──────────────────────────────────────────────────┘

All existing collections get + tenantId field:
  users, journeys, steps, kpis, evidence,
  run_requests, run_logs, agent_runs, articles,
  summaries, events, memory_facts, memory_extractions
```

### 3.2 Role Model (Two Dimensions)

```
Global Role (system-wide):
  "superadmin" — can see all tenants, impersonate, manage platform
  "user"       — normal user, scoped to their tenant

Org Role (per-tenant):
  "owner"  — 1 per tenant; can delete org, manage billing, transfer ownership
  "admin"  — manage members, invitations, tenant settings
  "member" — use features (AI Planner, Chat, Optimize, etc.)
```

### 3.3 Request Flow with Tenant Context

```
Request → JWT Auth Guard → TenantMiddleware → Controller → Service → Repository
                              │
                              ├─ Extracts tenantId from user record
                              ├─ Attaches to request: req.tenantId
                              └─ Repositories auto-filter: { tenantId: req.tenantId }
```

### 3.4 Billing Model

```
Plans:
  FREE       — 100 LLM calls/month, 3 users, no KB builder
  PRO        — 5,000 LLM calls/month, 25 users, KB builder, priority support
  ENTERPRISE — 50,000 LLM calls/month, unlimited users, custom KB, SLA

Add-on: LLM Call Pack — purchasable bundles (e.g., 1,000 extra calls for $X)

Stripe objects per tenant:
  - 1 Stripe Customer
  - 1 Stripe Subscription (for recurring plan)
  - N Stripe Payment Intents (for add-on packs)
```

---

## Phase 1 — Data Model & Tenant Middleware

**Goal**: Add `tenantId` everywhere, create tenant collection, make all queries tenant-scoped.

### 1.1 Shared Types

**New file: `packages/shared/src/types/tenant.ts`**

```typescript
export interface Tenant {
  id: string;
  name: string; // "Mito Kft."
  slug: string; // "mito" — URL-friendly, unique
  plan: TenantPlan;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  settings: TenantSettings;
  quotas: TenantQuotas;
  usage: TenantUsage;
  createdAt: string;
  updatedAt: string;
}

export type TenantPlan = 'free' | 'pro' | 'enterprise';

export interface TenantSettings {
  displayName?: string;
  logoUrl?: string;
  // Future: custom branding, feature flags
}

export interface TenantQuotas {
  maxUsers: number; // Plan-based: 3 / 25 / unlimited (-1)
  maxLlmCallsPerMonth: number; // Plan-based: 100 / 5,000 / 50,000
  additionalLlmCalls: number; // Purchased add-on packs (resets on use)
}

export interface TenantUsage {
  currentPeriodStart: string; // ISO date — Stripe billing period start
  llmCallsUsed: number; // This period
  lastResetAt: string;
}

export type OrgRole = 'owner' | 'admin' | 'member';
```

**Modify: `packages/shared/src/types/user.ts`**

```typescript
export interface User {
  // ... existing fields ...
  tenantId: string; // NEW — references tenant.id
  orgRole: OrgRole; // NEW — role within the tenant
  // role: Role → change from "employee"|"admin" to "superadmin"|"user"
}
```

**New file: `packages/shared/src/types/invitation.ts`**

```typescript
export interface Invitation {
  id: string;
  tenantId: string;
  email: string; // Invited email (any Google account)
  orgRole: OrgRole; // Role they'll get when they join
  invitedBy: string; // userId of inviter
  status: InvitationStatus;
  token: string; // Unique invite token (for email link)
  expiresAt: string;
  createdAt: string;
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';
```

### 1.2 Shared Constants

**Modify: `packages/shared/src/constants/roles.ts`**

```typescript
// Global roles (system-wide)
export const GLOBAL_ROLES = ['superadmin', 'user'] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

// Org roles (per-tenant)
export const ORG_ROLES = ['owner', 'admin', 'member'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

// DEPRECATED — keep for backward compat during migration, then remove
export const ROLES = ['employee', 'admin'] as const;
export type Role = (typeof ROLES)[number];
```

**New file: `packages/shared/src/constants/plans.ts`**

```typescript
export const TENANT_PLANS = ['free', 'pro', 'enterprise'] as const;
export type TenantPlan = (typeof TENANT_PLANS)[number];

export const PLAN_LIMITS: Record<
  TenantPlan,
  {
    maxUsers: number;
    maxLlmCallsPerMonth: number;
    hasKbBuilder: boolean;
    hasPrioritySupport: boolean;
  }
> = {
  free: { maxUsers: 3, maxLlmCallsPerMonth: 100, hasKbBuilder: false, hasPrioritySupport: false },
  pro: { maxUsers: 25, maxLlmCallsPerMonth: 5_000, hasKbBuilder: true, hasPrioritySupport: true },
  enterprise: {
    maxUsers: -1,
    maxLlmCallsPerMonth: 50_000,
    hasKbBuilder: true,
    hasPrioritySupport: true,
  },
};

export const LLM_CALL_PACK_SIZE = 1_000; // Additional calls per purchased pack
```

### 1.3 Zod Schemas

**New file: `packages/shared/src/schemas/tenant.schema.ts`**

```typescript
export const createTenantSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  plan: z.enum(TENANT_PLANS).default('free'),
});

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  settings: tenantSettingsSchema.optional(),
});
```

**New file: `packages/shared/src/schemas/invitation.schema.ts`**

```typescript
export const createInvitationSchema = z.object({
  email: z.string().email(),
  orgRole: z.enum(ORG_ROLES).default('member'),
});

export const bulkInviteSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(50),
  orgRole: z.enum(ORG_ROLES).default('member'),
});
```

**Modify: `packages/shared/src/schemas/user.schema.ts`**

```typescript
// REMOVE: .endsWith("@mito.hu") from email validation
// ADD: tenantId, orgRole fields to createUserSchema
export const createUserSchema = z.object({
  googleId: z.string().min(1),
  email: z.string().email(), // ← no domain restriction
  name: z.string().min(1).max(200),
  avatarUrl: z.string().url().optional(),
  role: z.enum(GLOBAL_ROLES).default('user'),
  tenantId: z.string().min(1),
  orgRole: z.enum(ORG_ROLES).default('member'),
});
```

### 1.4 Tenant Repository

**New file: `services/api/src/tenants/tenants.repository.ts`**

Methods:

- `create(input)` — insert new tenant, generate ULID id
- `getById(id)` — find by tenant ID
- `getBySlug(slug)` — find by slug (for URL routing)
- `update(id, updates)` — partial update
- `delete(id)` — soft delete or hard delete
- `list(filters)` — paginated list (for super-admin)
- `incrementUsage(tenantId, field, amount)` — atomic increment for usage tracking
- `resetUsage(tenantId)` — reset monthly counters

### 1.5 Invitation Repository

**New file: `services/api/src/invitations/invitations.repository.ts`**

Methods:

- `create(input)` — insert invitation with generated token + expiry
- `getByToken(token)` — find by invite token (for accepting)
- `getByEmail(email)` — find all pending invitations for an email
- `getByTenant(tenantId)` — list all invitations for a tenant
- `updateStatus(id, status)` — mark as accepted/expired/revoked
- `deleteExpired()` — cleanup cron

### 1.6 Modify All Existing Repositories

Every repository method that queries MongoDB must include `tenantId` in its filter. The approach:

**Option A (recommended): Tenant-scoped base repository**

Create an abstract `TenantScopedRepository` that all repositories extend:

```typescript
// services/api/src/common/tenant-scoped.repository.ts
export abstract class TenantScopedRepository {
  constructor(
    protected readonly db: Db,
    protected readonly collectionName: string,
  ) {}

  protected collection() {
    return this.db.collection(this.collectionName);
  }

  // All query helpers auto-inject tenantId
  protected withTenant(filter: Filter<Document>, tenantId: string): Filter<Document> {
    return { ...filter, tenantId };
  }
}
```

**Changes per repository:**

| Repository            | Changes Required                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `UsersRepository`     | Add `tenantId` to all queries; `getByEmail` becomes `getByEmailAndTenant`; `getByGoogleId` stays global (for login resolution) |
| `JourneysRepository`  | Add `tenantId` to all CRUD                                                                                                     |
| `RunsRepository`      | Add `tenantId` to all CRUD + status queries                                                                                    |
| `AgentRunsRepository` | Add `tenantId` to all CRUD + stats                                                                                             |
| `MemoryRepository`    | Add `tenantId` to all facts/extractions queries                                                                                |
| KB Builder repos      | Add `tenantId` to articles, summaries, agent_runs                                                                              |

### 1.7 Tenant Context Middleware

**New file: `services/api/src/common/middleware/tenant-context.middleware.ts`**

```typescript
// NestJS middleware that extracts tenantId from the authenticated user
// and attaches it to the request object for downstream use.

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly usersRepo: UsersRepository) {}

  async use(req: RequestWithTenant, res: Response, next: NextFunction) {
    // req.user is populated by Passport JWT strategy
    if (req.user?.userId) {
      const user = await this.usersRepo.getById(req.user.userId);
      if (user?.tenantId) {
        req.tenantId = user.tenantId;
        req.orgRole = user.orgRole;
      }
    }
    next();
  }
}
```

**New decorator: `@TenantId()`** — parameter decorator to extract `req.tenantId`:

```typescript
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.tenantId;
});
```

### 1.8 MongoDB Indexes

Add compound indexes on all collections:

```javascript
// For every collection that gets tenantId:
db.users.createIndex({ tenantId: 1, email: 1 }, { unique: true });
db.users.createIndex({ tenantId: 1 });
db.agent_runs.createIndex({ tenantId: 1, createdAt: -1 });
db.memory_facts.createIndex({ tenantId: 1, userId: 1 });
db.articles.createIndex({ tenantId: 1 });
db.summaries.createIndex({ tenantId: 1 });
// etc.
```

### 1.9 Files to Create/Modify

| Action | File                                                              | What                                                                   |
| ------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| CREATE | `packages/shared/src/types/tenant.ts`                             | Tenant, TenantPlan, TenantSettings, TenantQuotas, TenantUsage, OrgRole |
| CREATE | `packages/shared/src/types/invitation.ts`                         | Invitation, InvitationStatus                                           |
| CREATE | `packages/shared/src/constants/plans.ts`                          | TENANT_PLANS, PLAN_LIMITS, LLM_CALL_PACK_SIZE                          |
| CREATE | `packages/shared/src/schemas/tenant.schema.ts`                    | createTenantSchema, updateTenantSchema                                 |
| CREATE | `packages/shared/src/schemas/invitation.schema.ts`                | createInvitationSchema, bulkInviteSchema                               |
| MODIFY | `packages/shared/src/types/user.ts`                               | Add tenantId, orgRole                                                  |
| MODIFY | `packages/shared/src/constants/roles.ts`                          | Add GLOBAL_ROLES, ORG_ROLES                                            |
| MODIFY | `packages/shared/src/schemas/user.schema.ts`                      | Remove @mito.hu, add tenantId/orgRole                                  |
| MODIFY | `packages/shared/src/index.ts`                                    | Export new types                                                       |
| CREATE | `services/api/src/common/tenant-scoped.repository.ts`             | Base class for tenant-scoped repos                                     |
| CREATE | `services/api/src/common/middleware/tenant-context.middleware.ts` | Middleware                                                             |
| CREATE | `services/api/src/common/decorators/tenant-id.decorator.ts`       | @TenantId() decorator                                                  |
| CREATE | `services/api/src/tenants/tenants.repository.ts`                  | Tenant CRUD                                                            |
| CREATE | `services/api/src/tenants/tenants.service.ts`                     | Tenant business logic                                                  |
| CREATE | `services/api/src/tenants/tenants.module.ts`                      | Module                                                                 |
| CREATE | `services/api/src/invitations/invitations.repository.ts`          | Invitation CRUD                                                        |
| CREATE | `services/api/src/invitations/invitations.service.ts`             | Invite logic + email                                                   |
| CREATE | `services/api/src/invitations/invitations.controller.ts`          | Invite API endpoints                                                   |
| CREATE | `services/api/src/invitations/invitations.module.ts`              | Module                                                                 |
| MODIFY | `services/api/src/users/users.repository.ts`                      | Add tenantId to all queries                                            |
| MODIFY | `services/api/src/journeys/journeys.repository.ts`                | Add tenantId to all queries                                            |
| MODIFY | `services/api/src/runs/runs.repository.ts`                        | Add tenantId to all queries                                            |
| MODIFY | `services/api/src/agent-runs/agent-runs.repository.ts`            | Add tenantId to all queries                                            |
| MODIFY | `services/api/src/memory/memory.repository.ts`                    | Add tenantId to all queries                                            |
| MODIFY | `services/api/src/app.module.ts`                                  | Register TenantContextMiddleware, new modules                          |
| MODIFY | `scripts/mongo-init.js`                                           | Add tenants + invitations collections, compound indexes                |
| MODIFY | `scripts/seed-db.ts`                                              | Add tenants + invitations indexes                                      |

---

## Phase 2 — Auth Overhaul & Invitations

**Goal**: Remove domain restriction, implement invite-only signup, resolve tenant on login.

### 2.1 Auth Flow Changes

**Current flow:**

```
Google Login → POST /auth/token → decode id_token → upsert user (must be @mito.hu) → return tokens
```

**New flow:**

```
Google Login → POST /auth/token → decode id_token →
  ├─ User exists? → look up tenantId → return tokens + tenant context
  └─ User doesn't exist? →
       ├─ Pending invitation for this email? → create user, assign to tenant, mark invite accepted → return tokens
       └─ No invitation? → return 403 "No invitation found. Ask your org admin for an invite."
```

### 2.2 Changes to `auth.service.ts`

```
- Remove DEFAULT_ADMINS hardcoded list (replace with superadmin concept)
- Remove @mito.hu domain check (it's in the Zod schema, not auth service, but auth creates users)
- upsertUser() must now:
  1. Check for existing user by googleId/email
  2. If new user: look for pending invitation → create user with tenantId + orgRole from invitation
  3. If no invitation: reject
  4. Return user with tenantId context
- Token response must include: tenantId, orgRole, tenantName, tenantPlan
```

### 2.3 Changes to `jwt.strategy.ts`

The `validate()` method must return the full tenant context:

```typescript
async validate(payload): Promise<RequestUser> {
  const user = await this.usersService.getByGoogleId(payload.sub);
  if (!user) throw new UnauthorizedException();
  return {
    userId: user.id,
    email: user.email,
    role: user.role,        // global: "superadmin" | "user"
    tenantId: user.tenantId,
    orgRole: user.orgRole,  // "owner" | "admin" | "member"
  };
}
```

### 2.4 Invitation System

**New endpoints:**

| Method   | Path                         | Auth                 | Description                               |
| -------- | ---------------------------- | -------------------- | ----------------------------------------- |
| `POST`   | `/invitations`               | orgRole: owner/admin | Create invitation (send email)            |
| `POST`   | `/invitations/bulk`          | orgRole: owner/admin | Invite multiple emails                    |
| `GET`    | `/invitations`               | orgRole: owner/admin | List tenant's invitations                 |
| `DELETE` | `/invitations/:id`           | orgRole: owner/admin | Revoke invitation                         |
| `GET`    | `/invitations/accept/:token` | Public               | Preview invitation (check token validity) |
| `POST`   | `/invitations/accept/:token` | Authenticated        | Accept invitation (user joins tenant)     |

**Email sending**: Use a simple transactional email service. Options:

- **AWS SES** (already have AWS account) — cheapest, ~$0.10/1000 emails
- **Resend** — developer-friendly, free tier 100 emails/day
- Start with Resend for simplicity, migrate to SES for scale

**Invitation email content:**

```
Subject: You've been invited to join {tenantName} on AI Journey

{inviterName} has invited you to join {tenantName} on AI Journey.

[Accept Invitation →]  (links to: https://ai.1p.hu/invite/{token})

This invitation expires in 7 days.
```

### 2.5 Frontend Auth Changes

**`auth.svelte.ts` store** — expand user state:

```typescript
interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: GlobalRole; // "superadmin" | "user"
  tenantId: string;
  orgRole: OrgRole; // "owner" | "admin" | "member"
  tenantName: string;
  tenantPlan: TenantPlan;
  token: string;
  onboardingComplete: boolean;
}
```

**New page: `/invite/[token]`** — invitation acceptance flow:

1. Show invitation details (tenant name, role)
2. "Accept" button → Google login → `POST /invitations/accept/:token`
3. Redirect to dashboard

### 2.6 Creating the First Tenant (Bootstrap)

The first tenant (Mito) must be created via a migration/seed script:

```typescript
// scripts/migrate-to-multi-tenant.ts
// 1. Create "mito" tenant document
// 2. Update all existing users: set tenantId = mito.id, orgRole = "member"
// 3. Promote existing admins to orgRole = "owner"/"admin"
// 4. Update all existing documents in all collections: set tenantId = mito.id
// 5. Promote d.pal@mito.hu to global role = "superadmin"
```

### 2.7 Files to Create/Modify

| Action | File                                                     | What                                                                                 |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| MODIFY | `services/api/src/auth/auth.service.ts`                  | Remove domain restriction, add invitation-based join, add tenant context to response |
| MODIFY | `services/api/src/auth/auth.controller.ts`               | Return tenant context in auth responses                                              |
| MODIFY | `services/api/src/auth/jwt.strategy.ts`                  | Return tenantId + orgRole in validate()                                              |
| MODIFY | `packages/shared/src/schemas/user.schema.ts`             | Remove `.endsWith("@mito.hu")`                                                       |
| CREATE | `services/api/src/invitations/invitations.controller.ts` | CRUD + accept endpoints                                                              |
| CREATE | `services/api/src/invitations/invitations.service.ts`    | Business logic, email sending                                                        |
| CREATE | `services/api/src/invitations/invitations.repository.ts` | MongoDB CRUD                                                                         |
| CREATE | `services/api/src/invitations/invitations.module.ts`     | Module                                                                               |
| CREATE | `services/api/src/common/email/email.service.ts`         | Transactional email via Resend/SES                                                   |
| CREATE | `services/api/src/common/email/email.module.ts`          | Module                                                                               |
| MODIFY | `apps/web/src/lib/stores/auth.svelte.ts`                 | Add tenantId, orgRole, tenantName, tenantPlan                                        |
| CREATE | `apps/web/src/routes/invite/[token]/+page.svelte`        | Invitation acceptance page                                                           |
| CREATE | `scripts/migrate-to-multi-tenant.ts`                     | Data migration script                                                                |

---

## Phase 3 — Per-Tenant RBAC

**Goal**: Org-level roles enforced on every endpoint.

### 3.1 Role Hierarchy

```
superadmin (global) > owner (org) > admin (org) > member (org)

superadmin:
  - Access all tenants
  - Impersonate any user
  - Manage platform settings
  - Override quotas

owner (per tenant):
  - All admin permissions
  - Delete organization
  - Transfer ownership
  - Manage billing/subscription
  - Remove admins

admin (per tenant):
  - Invite/remove members
  - Manage tenant settings
  - View usage/billing (read-only)
  - Access all tenant features

member (per tenant):
  - Use AI features (Planner, Chat, Optimize, etc.)
  - View own profile
  - View own memory
  - Cannot invite users or manage settings
```

### 3.2 Guard Implementation

**Modify: `services/api/src/auth/roles.guard.ts`**

Replace the current flat role check with a two-tier system:

```typescript
// New decorator: @OrgRoles('owner', 'admin')
// New decorator: @GlobalRoles('superadmin')

// Guard logic:
// 1. If @GlobalRoles specified → check user.role against global roles
// 2. If @OrgRoles specified → check user.orgRole against org roles
// 3. Superadmin always passes org role checks (override)
// 4. If neither decorator → allow any authenticated user
```

**New decorators:**

```typescript
// services/api/src/auth/decorators/org-roles.decorator.ts
export const OrgRoles = (...roles: OrgRole[]) => SetMetadata('orgRoles', roles);

// services/api/src/auth/decorators/global-roles.decorator.ts
export const GlobalRoles = (...roles: GlobalRole[]) => SetMetadata('globalRoles', roles);
```

### 3.3 Endpoint Authorization Matrix

| Endpoint                    | Global Role | Org Role     | Notes               |
| --------------------------- | ----------- | ------------ | ------------------- |
| `GET /health`               | —           | —            | Public              |
| `POST /auth/token`          | —           | —            | Public              |
| `GET /auth/me`              | any         | any          | Authenticated       |
| `POST /invitations`         | —           | owner, admin | Tenant-scoped       |
| `GET /users`                | —           | owner, admin | Tenant-scoped list  |
| `PATCH /users/:id`          | —           | owner, admin | Or self-update      |
| `POST /ai-planner/*`        | —           | any          | Tenant-scoped       |
| `POST /chat`                | —           | any          | Tenant-scoped       |
| `POST /prompt-optimizer/*`  | —           | any          | Tenant-scoped       |
| `GET /memory/facts/:userId` | —           | any (own)    | Or admin for others |
| `GET /memory/stats`         | superadmin  | owner, admin | Tenant-scoped stats |
| `GET /settings/*`           | superadmin  | owner, admin | Tenant settings     |
| `GET /superadmin/*`         | superadmin  | —            | Super-admin only    |

### 3.4 Files to Create/Modify

| Action | File                                                         | What                                              |
| ------ | ------------------------------------------------------------ | ------------------------------------------------- |
| CREATE | `services/api/src/auth/decorators/org-roles.decorator.ts`    | @OrgRoles()                                       |
| CREATE | `services/api/src/auth/decorators/global-roles.decorator.ts` | @GlobalRoles()                                    |
| MODIFY | `services/api/src/auth/roles.guard.ts`                       | Two-tier role checking                            |
| MODIFY | All controllers                                              | Add appropriate @OrgRoles/@GlobalRoles decorators |

---

## Phase 4 — Usage Quotas & Metering

**Goal**: Track and enforce LLM call limits per tenant per billing period.

### 4.1 Data Model

Quotas live on the `tenants` document (see Phase 1 Tenant type). Usage tracking:

```typescript
// Tracked per tenant in the tenants collection:
{
  quotas: {
    maxUsers: 25,
    maxLlmCallsPerMonth: 5000,
    additionalLlmCalls: 1000,  // purchased packs
  },
  usage: {
    currentPeriodStart: "2026-03-01T00:00:00Z",
    llmCallsUsed: 347,
    lastResetAt: "2026-03-01T00:00:00Z",
  }
}
```

### 4.2 Quota Check Service

**New file: `services/api/src/quotas/quota.service.ts`**

```typescript
@Injectable()
export class QuotaService {
  /**
   * Check if tenant has remaining LLM calls.
   * Called BEFORE every LLM API invocation.
   * Throws QuotaExceededError if limit reached.
   */
  async checkAndIncrement(tenantId: string): Promise<void> {
    const tenant = await this.tenantsRepo.getById(tenantId);
    const totalAllowed = tenant.quotas.maxLlmCallsPerMonth + tenant.quotas.additionalLlmCalls;
    if (tenant.usage.llmCallsUsed >= totalAllowed) {
      throw new QuotaExceededError(tenantId, totalAllowed);
    }
    // Atomic increment
    await this.tenantsRepo.incrementUsage(tenantId, "usage.llmCallsUsed", 1);
  }

  /**
   * Reset monthly usage. Called by Stripe webhook on billing period start,
   * or by a daily cron that checks currentPeriodStart.
   */
  async resetMonthlyUsage(tenantId: string): Promise<void> { ... }
}
```

### 4.3 Quota Enforcement Points

Every controller/service that makes an LLM call must check quota first:

| Service                                     | LLM Provider        | Where to Add Check   |
| ------------------------------------------- | ------------------- | -------------------- |
| `AiPlannerService.generateQuestions()`      | Grok (xAI)          | Before Grok API call |
| `AiPlannerService.generateStrategy()`       | OpenAI gpt-5.2      | Before OpenAI call   |
| `ChatService.chat()`                        | Gemini              | Before Gemini call   |
| `PromptOptimizerService.analyzePrompt()`    | OpenAI gpt-5.2      | Before OpenAI call   |
| `PromptOptimizerService.optimizePrompt()`   | OpenAI gpt-5.2      | Before OpenAI call   |
| `MemoryExtractionService.extractAndStore()` | OpenAI gpt-5.2-nano | Before OpenAI call   |
| KB Builder (multiple)                       | OpenAI              | Before each call     |

**Implementation approach**: Create a `@CheckQuota()` decorator or inject `QuotaService` in each service. The quota check needs the `tenantId`, which flows from the request context.

### 4.4 Usage Dashboard API

**New endpoints:**

| Method | Path                | Auth                 | Description                    |
| ------ | ------------------- | -------------------- | ------------------------------ |
| `GET`  | `/usage`            | any authenticated    | Get own tenant's usage summary |
| `GET`  | `/usage/history`    | orgRole: owner/admin | Monthly usage history          |
| `GET`  | `/superadmin/usage` | superadmin           | All tenants' usage             |

### 4.5 Files to Create/Modify

| Action | File                                                            | What                                        |
| ------ | --------------------------------------------------------------- | ------------------------------------------- |
| CREATE | `services/api/src/quotas/quota.service.ts`                      | Check + increment logic                     |
| CREATE | `services/api/src/quotas/quota.module.ts`                       | Module                                      |
| CREATE | `services/api/src/quotas/quota-exceeded.error.ts`               | Custom error class                          |
| MODIFY | `services/api/src/ai-planner/ai-planner.service.ts`             | Inject QuotaService, check before LLM calls |
| MODIFY | `services/api/src/chat/chat.service.ts`                         | Inject QuotaService, check before LLM calls |
| MODIFY | `services/api/src/prompt-optimizer/prompt-optimizer.service.ts` | Inject QuotaService, check before LLM calls |
| MODIFY | `services/api/src/memory/memory-extraction.service.ts`          | Inject QuotaService, check before LLM calls |
| MODIFY | KB Builder services                                             | Pass tenantId through queue, check quota    |
| CREATE | `services/api/src/usage/usage.controller.ts`                    | Usage API endpoints                         |
| CREATE | `services/api/src/usage/usage.service.ts`                       | Usage aggregation                           |
| CREATE | `services/api/src/usage/usage.module.ts`                        | Module                                      |

---

## Phase 5 — Stripe Billing

**Goal**: Subscription management with Stripe Checkout, Customer Portal, and webhooks.

### 5.1 Stripe Setup

**New env vars for `AppConfigService`:**

```
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_FREE_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...
STRIPE_LLM_PACK_PRICE_ID=price_...   # One-time price for 1,000 LLM call pack
```

### 5.2 Stripe Products & Prices (to create in Stripe Dashboard)

```
Product: "AI Journey Pro"
  Price: $XX/month (recurring)    → STRIPE_PRO_PRICE_ID

Product: "AI Journey Enterprise"
  Price: $XXX/month (recurring)   → STRIPE_ENTERPRISE_PRICE_ID

Product: "LLM Call Pack (1,000 calls)"
  Price: $X (one-time)            → STRIPE_LLM_PACK_PRICE_ID
```

### 5.3 Billing Service

**New file: `services/api/src/billing/billing.service.ts`**

```typescript
@Injectable()
export class BillingService {
  private stripe: Stripe;

  // Create Stripe customer for new tenant
  async createCustomer(tenant: Tenant, ownerEmail: string): Promise<string>;

  // Create Checkout Session for plan subscription
  async createCheckoutSession(tenantId: string, plan: TenantPlan): Promise<string>; // returns URL

  // Create Checkout Session for LLM call pack add-on
  async createAddOnCheckout(tenantId: string, packs: number): Promise<string>;

  // Create Customer Portal session (self-service: cancel, update card, view invoices)
  async createPortalSession(tenantId: string): Promise<string>; // returns URL

  // Handle incoming webhooks
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void>;
}
```

### 5.4 Webhook Events to Handle

| Stripe Event                    | Action                                                |
| ------------------------------- | ----------------------------------------------------- |
| `checkout.session.completed`    | Update tenant: set stripeSubscriptionId, plan, quotas |
| `customer.subscription.updated` | Update plan tier if changed (upgrade/downgrade)       |
| `customer.subscription.deleted` | Downgrade tenant to free plan                         |
| `invoice.paid`                  | Reset monthly usage counter                           |
| `invoice.payment_failed`        | Flag tenant, send warning email                       |
| `payment_intent.succeeded`      | For add-on packs: increment `additionalLlmCalls`      |

### 5.5 Billing API Endpoints

| Method | Path                | Auth                  | Description                                   |
| ------ | ------------------- | --------------------- | --------------------------------------------- |
| `POST` | `/billing/checkout` | orgRole: owner        | Create Checkout Session (redirects to Stripe) |
| `POST` | `/billing/add-on`   | orgRole: owner        | Buy additional LLM call packs                 |
| `POST` | `/billing/portal`   | orgRole: owner        | Get Customer Portal URL                       |
| `POST` | `/billing/webhook`  | Public (Stripe sig)   | Stripe webhook handler                        |
| `GET`  | `/billing/status`   | orgRole: owner, admin | Current plan, next invoice, usage             |

### 5.6 Frontend Billing Pages

```
/settings/billing          — Current plan, usage, upgrade button
/settings/billing/success  — "Subscription activated!" redirect target
/settings/billing/cancel   — "Subscription cancelled" redirect target
```

### 5.7 Tenant Creation Flow (with billing)

```
1. User clicks "Create Organization" (or accepts invitation as first user)
2. POST /tenants → creates tenant on free plan (no Stripe customer yet)
3. Owner clicks "Upgrade to Pro" → POST /billing/checkout
4. Redirect to Stripe Checkout → user pays → webhook fires
5. checkout.session.completed → update tenant plan + quotas
```

### 5.8 Files to Create/Modify

| Action | File                                                        | What                                |
| ------ | ----------------------------------------------------------- | ----------------------------------- |
| CREATE | `services/api/src/billing/billing.service.ts`               | Stripe integration                  |
| CREATE | `services/api/src/billing/billing.controller.ts`            | Checkout, portal, webhook endpoints |
| CREATE | `services/api/src/billing/billing.module.ts`                | Module                              |
| MODIFY | `services/api/src/config/config.service.ts`                 | Add Stripe env vars                 |
| MODIFY | `services/api/package.json`                                 | Add `stripe` dependency             |
| MODIFY | `services/api/src/app.module.ts`                            | Register BillingModule              |
| MODIFY | `docker-compose.server.yml`                                 | Add STRIPE\_\* env vars             |
| CREATE | `apps/web/src/routes/settings/billing/+page.svelte`         | Billing management page             |
| CREATE | `apps/web/src/routes/settings/billing/success/+page.svelte` | Post-checkout success               |

---

## Phase 6 — Super-Admin Panel

**Goal**: Platform-wide management for superadmins.

### 6.1 Super-Admin API Endpoints

| Method   | Path                                  | Description                           |
| -------- | ------------------------------------- | ------------------------------------- |
| `GET`    | `/superadmin/tenants`                 | List all tenants with stats           |
| `GET`    | `/superadmin/tenants/:id`             | Tenant detail (users, usage, billing) |
| `PATCH`  | `/superadmin/tenants/:id`             | Update tenant (plan, quotas override) |
| `DELETE` | `/superadmin/tenants/:id`             | Delete tenant (soft delete)           |
| `POST`   | `/superadmin/tenants/:id/impersonate` | Get token to act as tenant user       |
| `GET`    | `/superadmin/usage`                   | Global usage dashboard                |
| `GET`    | `/superadmin/users`                   | List all users across tenants         |
| `PATCH`  | `/superadmin/users/:id/role`          | Promote/demote global role            |

### 6.2 Impersonation

Superadmin can "act as" any user for debugging:

```
POST /superadmin/tenants/:tenantId/impersonate
Body: { userId: "..." }
Response: { token: "...", expiresIn: 3600 }
```

The token is a signed JWT with `impersonatedBy: superadminUserId` claim. The TenantContextMiddleware detects this and sets the appropriate tenant context.

### 6.3 Frontend Super-Admin Pages

```
/superadmin                     — Dashboard (tenant count, total users, total usage)
/superadmin/tenants             — Tenant list with search/filter
/superadmin/tenants/:id         — Tenant detail (members, usage, billing, actions)
/superadmin/users               — All users across all tenants
```

**Access control**: Only visible when `auth.user.role === "superadmin"`. Add to Sidebar under "Platform Admin" section.

### 6.4 Files to Create

| Action | File                                                       | What                        |
| ------ | ---------------------------------------------------------- | --------------------------- |
| CREATE | `services/api/src/superadmin/superadmin.controller.ts`     | All super-admin endpoints   |
| CREATE | `services/api/src/superadmin/superadmin.service.ts`        | Cross-tenant queries        |
| CREATE | `services/api/src/superadmin/superadmin.module.ts`         | Module                      |
| CREATE | `apps/web/src/routes/superadmin/+layout.svelte`            | Layout with navigation      |
| CREATE | `apps/web/src/routes/superadmin/+page.svelte`              | Dashboard                   |
| CREATE | `apps/web/src/routes/superadmin/tenants/+page.svelte`      | Tenant list                 |
| CREATE | `apps/web/src/routes/superadmin/tenants/[id]/+page.svelte` | Tenant detail               |
| CREATE | `apps/web/src/routes/superadmin/users/+page.svelte`        | Global user list            |
| MODIFY | `apps/web/src/lib/components/Sidebar.svelte`               | Add super-admin nav section |

---

## Phase 7 — Frontend Tenant Management

**Goal**: Org owners/admins can manage their tenant from the UI.

### 7.1 New Frontend Pages

```
/settings/organization       — Org name, slug, logo
/settings/members            — Member list, invite new, change roles, remove
/settings/billing            — Plan, usage, upgrade, add-on packs, invoices
```

### 7.2 Organization Settings Page

- Edit organization name
- View plan tier
- View member count / limit
- Danger zone: delete organization (owner only)

### 7.3 Members Management Page

- Table: name, email, org role, joined date, last active
- "Invite Members" button → modal with email input + role selector
- Bulk invite (CSV or comma-separated emails)
- Change member role (dropdown)
- Remove member (with confirmation)
- Pending invitations section (with revoke option)

### 7.4 Billing Page

- Current plan card (tier, price, renewal date)
- Usage gauge (X / Y LLM calls used this month, with progress bar)
- "Upgrade Plan" button → Stripe Checkout
- "Buy More LLM Calls" button → one-time purchase flow
- "Manage Subscription" button → Stripe Customer Portal
- Invoice history (from Stripe)

### 7.5 Settings Tab Changes

**Modify: `apps/web/src/routes/settings/+layout.svelte`**

Current tabs (admin-only):

```
Overview | Agent Runs | Users | Vector DB | Summarization | KB Builder | KB Chat | Workers | Memory
```

New tabs (split by audience):

**For org owner/admin (Settings):**

```
Organization | Members | Billing | Usage
```

**For superadmin (Settings → Platform section):**

```
Overview | Agent Runs | All Users | Vector DB | Summarization | KB Builder | KB Chat | Workers | Memory
```

The Settings layout should detect `orgRole` and `role` to show the appropriate tabs.

### 7.6 Sidebar Navigation Changes

```
Current:
  Dashboard | AI Chat | AI Planner | Prompting Practices | Optimize My Prompt | Profile
  Admin: Settings

New:
  Dashboard | AI Chat | AI Planner | Prompting Practices | Optimize My Prompt | Profile
  Organization:
    Settings (owner/admin only)
    Members (owner/admin only)
  Platform Admin (superadmin only):
    Super Admin Panel
```

### 7.7 Files to Create/Modify

| Action | File                                                     | What                             |
| ------ | -------------------------------------------------------- | -------------------------------- |
| CREATE | `apps/web/src/routes/settings/organization/+page.svelte` | Org settings                     |
| CREATE | `apps/web/src/routes/settings/members/+page.svelte`      | Member management                |
| MODIFY | `apps/web/src/routes/settings/+layout.svelte`            | Split tabs by role               |
| MODIFY | `apps/web/src/lib/components/Sidebar.svelte`             | Add org + superadmin sections    |
| MODIFY | `apps/web/src/routes/settings/billing/+page.svelte`      | Full billing page (from Phase 5) |

---

## Migration Strategy

### Step 1: Prepare Data Migration Script

**File: `scripts/migrate-to-multi-tenant.ts`**

This script transforms the existing single-tenant database into a multi-tenant structure:

```
1. Create the initial "mito" tenant document:
   {
     id: ulid(),
     name: "Mito Kft.",
     slug: "mito",
     plan: "enterprise",
     settings: {},
     quotas: { maxUsers: -1, maxLlmCallsPerMonth: 50000, additionalLlmCalls: 0 },
     usage: { currentPeriodStart: now, llmCallsUsed: 0, lastResetAt: now },
     createdAt: now,
     updatedAt: now,
   }

2. Update all users:
   - Set tenantId = mito.id
   - Set orgRole:
     - d.pal@mito.hu → role="superadmin", orgRole="owner"
     - existing role="admin" → role="user", orgRole="admin"
     - existing role="employee" → role="user", orgRole="member"

3. For EACH collection (users, journeys, steps, kpis, evidence,
   run_requests, run_logs, agent_runs, articles, summaries, events,
   memory_facts, memory_extractions):
   - db.collection.updateMany({}, { $set: { tenantId: mitoTenantId } })

4. Create new compound indexes (tenantId + existing keys)

5. Create invitations collection with indexes

6. Verify: count documents without tenantId (should be 0)
```

### Step 2: Migration Execution Plan

```
1. Take the app offline (maintenance mode)
2. Backup MongoDB: mongodump --db aijourney
3. Run migration script: pnpm run migrate:multi-tenant
4. Verify migration: run verification script
5. Deploy new multi-tenant code
6. Verify app works with migrated data
7. Resume normal operations
```

### Step 3: Rollback Plan

```
If migration fails:
1. Stop the app
2. Drop the aijourney database
3. Restore from backup: mongorestore --db aijourney
4. Deploy previous code version (git revert)
5. Resume operations
```

---

## Testing Strategy

### Unit Tests

| Component                 | Test Focus                                    |
| ------------------------- | --------------------------------------------- |
| Tenant repository         | CRUD operations, slug uniqueness              |
| Invitation repository     | Token generation, expiry, status transitions  |
| Quota service             | Check + increment, reset, exceeded error      |
| Billing service           | Stripe mock: checkout, webhook event handling |
| Roles guard               | Two-tier role checking, superadmin override   |
| Tenant middleware         | tenantId extraction, missing tenant handling  |
| All modified repositories | Verify tenantId is included in all queries    |

### Integration Tests

| Test              | Description                                                  |
| ----------------- | ------------------------------------------------------------ |
| Tenant isolation  | Create 2 tenants with data, verify queries don't leak across |
| Invitation flow   | Invite → Google login → user auto-joins tenant               |
| Quota enforcement | Use up quota → next LLM call returns 429                     |
| Billing webhook   | Simulate Stripe events → verify plan/quota changes           |
| RBAC              | Member can't invite, admin can't delete org, owner can       |
| Migration script  | Run against test data, verify all documents get tenantId     |

### E2E Tests (Playwright)

| Test                                 | Description                                         |
| ------------------------------------ | --------------------------------------------------- |
| Invite member → login → use features | Full invitation flow                                |
| Upgrade plan                         | Owner upgrades via Stripe Checkout mock             |
| Quota exceeded                       | Use all calls → see "quota exceeded" error in UI    |
| Super-admin views all tenants        | Login as superadmin, verify cross-tenant visibility |

---

## Rollout Plan

### Phase 1 (Week 1-2): Data Model & Middleware

- Implement shared types, tenant collection, migration script
- Add tenantId to all repositories
- Create tenant context middleware
- Run migration on dev, verify
- **Milestone**: All queries tenant-scoped, existing Mito functionality unchanged

### Phase 2 (Week 2-3): Auth & Invitations

- Remove domain restriction
- Implement invitation system
- Create invite acceptance page
- **Milestone**: Can invite non-mito.hu users, they can join

### Phase 3 (Week 3): RBAC

- Implement two-tier role guards
- Add decorators to all controllers
- **Milestone**: Members restricted from admin actions

### Phase 4 (Week 3-4): Quotas

- Implement quota service
- Add checks to all LLM call sites
- Create usage dashboard
- **Milestone**: LLM calls metered and enforced per tenant

### Phase 5 (Week 4-5): Stripe Billing

- Set up Stripe products/prices
- Implement checkout + webhook + portal
- Create billing page
- **Milestone**: Tenants can self-service upgrade/downgrade

### Phase 6 (Week 5): Super-Admin

- Implement super-admin API + pages
- Add impersonation
- **Milestone**: Platform manageable by superadmin

### Phase 7 (Week 5-6): Frontend Tenant Management

- Organization settings page
- Members management page
- Sidebar/navigation restructuring
- **Milestone**: Full self-service tenant management

### Production Deploy

- Feature-flag the multi-tenant code path during development
- Deploy Phase 1 first (backward compatible via migration)
- Deploy remaining phases incrementally
- Monitor for tenant isolation bugs, quota accuracy, Stripe webhook reliability

---

## Appendix: Complete File Impact Summary

### Files to CREATE (34 files)

```
packages/shared/src/types/tenant.ts
packages/shared/src/types/invitation.ts
packages/shared/src/constants/plans.ts
packages/shared/src/schemas/tenant.schema.ts
packages/shared/src/schemas/invitation.schema.ts
services/api/src/common/tenant-scoped.repository.ts
services/api/src/common/middleware/tenant-context.middleware.ts
services/api/src/common/decorators/tenant-id.decorator.ts
services/api/src/common/email/email.service.ts
services/api/src/common/email/email.module.ts
services/api/src/tenants/tenants.repository.ts
services/api/src/tenants/tenants.service.ts
services/api/src/tenants/tenants.controller.ts
services/api/src/tenants/tenants.module.ts
services/api/src/invitations/invitations.repository.ts
services/api/src/invitations/invitations.service.ts
services/api/src/invitations/invitations.controller.ts
services/api/src/invitations/invitations.module.ts
services/api/src/quotas/quota.service.ts
services/api/src/quotas/quota.module.ts
services/api/src/quotas/quota-exceeded.error.ts
services/api/src/billing/billing.service.ts
services/api/src/billing/billing.controller.ts
services/api/src/billing/billing.module.ts
services/api/src/usage/usage.controller.ts
services/api/src/usage/usage.service.ts
services/api/src/usage/usage.module.ts
services/api/src/superadmin/superadmin.controller.ts
services/api/src/superadmin/superadmin.service.ts
services/api/src/superadmin/superadmin.module.ts
services/api/src/auth/decorators/org-roles.decorator.ts
services/api/src/auth/decorators/global-roles.decorator.ts
scripts/migrate-to-multi-tenant.ts
apps/web/src/routes/invite/[token]/+page.svelte
apps/web/src/routes/settings/organization/+page.svelte
apps/web/src/routes/settings/members/+page.svelte
apps/web/src/routes/settings/billing/+page.svelte
apps/web/src/routes/settings/billing/success/+page.svelte
apps/web/src/routes/superadmin/+layout.svelte
apps/web/src/routes/superadmin/+page.svelte
apps/web/src/routes/superadmin/tenants/+page.svelte
apps/web/src/routes/superadmin/tenants/[id]/+page.svelte
apps/web/src/routes/superadmin/users/+page.svelte
```

### Files to MODIFY (30+ files)

```
packages/shared/src/types/user.ts
packages/shared/src/constants/roles.ts
packages/shared/src/schemas/user.schema.ts
packages/shared/src/index.ts
services/api/src/app.module.ts
services/api/src/config/config.service.ts
services/api/src/auth/auth.service.ts
services/api/src/auth/auth.controller.ts
services/api/src/auth/jwt.strategy.ts
services/api/src/auth/roles.guard.ts
services/api/src/users/users.repository.ts
services/api/src/journeys/journeys.repository.ts
services/api/src/runs/runs.repository.ts
services/api/src/agent-runs/agent-runs.repository.ts
services/api/src/memory/memory.repository.ts
services/api/src/ai-planner/ai-planner.service.ts
services/api/src/ai-planner/ai-planner.controller.ts
services/api/src/chat/chat.service.ts
services/api/src/chat/chat.controller.ts
services/api/src/prompt-optimizer/prompt-optimizer.service.ts
services/api/src/prompt-optimizer/prompt-optimizer.controller.ts
services/api/src/memory/memory-extraction.service.ts
services/api/src/memory/memory.controller.ts
services/api/package.json (add stripe)
services/kb-builder/src/article-repository.ts
services/kb-builder/src/summary-repository.ts
services/kb-builder/src/agent-run-logger.ts
scripts/mongo-init.js
scripts/seed-db.ts
docker-compose.server.yml
docker-compose.yml
apps/web/src/lib/stores/auth.svelte.ts
apps/web/src/lib/components/Sidebar.svelte
apps/web/src/routes/settings/+layout.svelte
apps/web/src/routes/profile/+page.svelte
```

### Dependencies to Add

```
services/api/package.json:
  + stripe: ^18.x
  + resend: ^4.x    (or @aws-sdk/client-ses for email)
  + nanoid: ^5.x    (for invitation tokens)
```

---

## Open Questions (resolve before implementation)

1. **Pricing**: What are the actual dollar amounts for Pro / Enterprise / LLM Pack?
2. **Email service**: Resend (simpler) vs AWS SES (cheaper, already have AWS)?
3. **KB Builder tenancy**: Should each tenant have their own Pinecone namespace, or shared with metadata filtering?
4. **Existing users**: After migration, should all current `@mito.hu` users remain in the Mito tenant, and future `@mito.hu` signups auto-join?
5. **Tenant deletion**: Soft delete (mark inactive, retain data) or hard delete (purge all data)?
6. **Free plan limits**: Are 100 LLM calls / 3 users the right limits for free tier?
7. **Trial period**: Should new tenants get a Pro trial (14 days) before falling back to Free?
