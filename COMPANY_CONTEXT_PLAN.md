# Company Context — Implementation Plan

> **Status**: Plan only — do not implement yet
> **Author**: AI Agent
> **Date**: 2026-03-03

---

## 1. Overview

**Goal**: Allow org admins to provide company-level context (free-text + uploaded documents) that gets automatically extracted and injected into **every LLM call** across the platform. This ensures all AI responses are tailored to the company's domain, products, terminology, and strategic priorities.

### User Stories

1. As an **org admin**, I can write a free-text company description (long-term context) in a "Company Settings" page.
2. As an **org admin**, I can upload documents (PDF, DOCX, TXT, MD) that describe the company.
3. The system **automatically extracts** structured facts from uploaded documents using gpt-5.2-mini.
4. As an **org admin**, I can re-trigger extraction for any document if the extraction quality is poor.
5. The combined company context (free-text + extracted facts) is **injected into all LLM calls** for users of that tenant.

---

## 2. Data Model

### 2.1 Extend `Tenant` interface

**File**: `packages/shared/src/types/tenant.ts`

Add a new field to the existing `Tenant` interface:

```typescript
export interface Tenant {
  // ... existing fields ...
  companyContext?: string;  // Free-text company description (admin-authored)
}
```

This is the raw admin-authored text, stored directly on the tenant document. Not extracted — just plain text the admin types in.

### 2.2 New type: `CompanyDocument`

**File**: `packages/shared/src/types/company-context.ts` (new)

```typescript
export interface CompanyDocument {
  id: string;
  tenantId: string;
  /** Original filename as uploaded */
  originalName: string;
  /** MIME type: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain, text/markdown */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Scaleway Object Storage key (path within the bucket) */
  storageKey: string;
  /** Extraction status */
  extractionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  /** Extracted structured facts (populated after extraction) */
  extractedFacts: CompanyFact[];
  /** Error message if extraction failed */
  extractionError?: string;
  /** Timestamp of last extraction attempt */
  lastExtractedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyFact {
  /** Unique ID within the document */
  id: string;
  /** Category: products, industry, culture, strategy, processes, terminology, other */
  category: CompanyFactCategory;
  /** The extracted fact (max ~50 words) */
  fact: string;
}

export const COMPANY_FACT_CATEGORIES = [
  'products',
  'industry',
  'culture',
  'strategy',
  'processes',
  'terminology',
  'other',
] as const;
export type CompanyFactCategory = (typeof COMPANY_FACT_CATEGORIES)[number];

/** API response for the combined company context (used for injection) */
export interface ResolvedCompanyContext {
  /** Admin-authored free-text */
  freeText: string;
  /** All extracted facts from all documents (deduplicated) */
  facts: CompanyFact[];
}
```

### 2.3 New MongoDB collection: `company_documents`

Indexes:
- `{ tenantId: 1, createdAt: -1 }` — list documents per tenant
- `{ tenantId: 1, extractionStatus: 1 }` — find pending/processing docs

---

## 3. Storage — Scaleway Object Storage

### 3.1 Bucket Setup

Scaleway Object Storage is S3-compatible. Create a dedicated bucket:

- **Bucket name**: `aijourney-company-docs`
- **Region**: `fr-par` (Paris — closest to the Scaleway server at `51.15.108.144`)
- **Key prefix**: `{tenantId}/{documentId}/{originalFilename}`

### 3.2 Environment Variables

```bash
# .env
SCW_ACCESS_KEY=...
SCW_SECRET_KEY=...
SCW_REGION=fr-par
SCW_BUCKET_NAME=aijourney-company-docs
SCW_ENDPOINT=https://s3.fr-par.scw.cloud
```

### 3.3 S3-Compatible Client

Use `@aws-sdk/client-s3` configured with the Scaleway endpoint:

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: config.SCW_REGION,
  endpoint: config.SCW_ENDPOINT,
  credentials: {
    accessKeyId: config.SCW_ACCESS_KEY,
    secretAccessKey: config.SCW_SECRET_KEY,
  },
  forcePathStyle: true, // Required for Scaleway
});
```

### 3.4 File Size Limits

- **Max file size**: 10 MB per document
- **Max documents per tenant**: 20
- **Allowed MIME types**: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`, `text/markdown`

---

## 4. Backend — NestJS Module

### 4.1 Module Structure

```
services/api/src/company-context/
├── company-context.module.ts
├── company-context.controller.ts
├── company-context.service.ts
├── company-context.repository.ts
├── company-document-storage.service.ts   # Scaleway S3 operations
└── company-context-extraction.service.ts  # LLM fact extraction
```

### 4.2 Repository (`company-context.repository.ts`)

MongoDB operations for `company_documents` collection:
- `create(doc: CompanyDocument): Promise<CompanyDocument>`
- `getById(tenantId: string, docId: string): Promise<CompanyDocument | undefined>`
- `listByTenant(tenantId: string): Promise<CompanyDocument[]>`
- `updateExtractionResult(docId: string, facts: CompanyFact[], status: string): Promise<void>`
- `updateExtractionError(docId: string, error: string): Promise<void>`
- `delete(tenantId: string, docId: string): Promise<void>`
- `getAllFactsByTenant(tenantId: string): Promise<CompanyFact[]>` — returns all extracted facts from all COMPLETED documents for a tenant

### 4.3 Storage Service (`company-document-storage.service.ts`)

Wraps Scaleway S3 operations:
- `upload(tenantId: string, docId: string, filename: string, buffer: Buffer, mimeType: string): Promise<string>` — returns `storageKey`
- `download(storageKey: string): Promise<Buffer>`
- `delete(storageKey: string): Promise<void>`

### 4.4 Extraction Service (`company-context-extraction.service.ts`)

LLM-based fact extraction from documents:

```typescript
const EXTRACTION_MODEL = 'gpt-5.2-mini';
```

**Flow**:
1. Download document from Scaleway
2. Parse content:
   - **PDF**: Use `pdf-parse` npm package to extract text
   - **DOCX**: Use `mammoth` npm package to extract text
   - **TXT/MD**: Read directly as UTF-8
3. Truncate to 100,000 chars (gpt-5.2-mini has 200K context window, leave room for prompt + output)
4. Send to gpt-5.2-mini with a structured extraction prompt
5. Parse JSON response into `CompanyFact[]`
6. Save to the document record

**LLM Prompt** (system message):

```
You are a company knowledge extraction assistant. You will receive the text content of a company document.

Extract ALL relevant facts about this company that would help an AI assistant provide better, more contextual responses to employees of this company.

Categories:
- "products": Products, services, or offerings the company provides
- "industry": Industry, market, competitors, domain expertise
- "culture": Company culture, values, communication style, work practices
- "strategy": Business goals, strategic priorities, OKRs, initiatives
- "processes": Internal processes, tools, workflows, methodologies
- "terminology": Company-specific jargon, acronyms, product names
- "other": Any other relevant company facts

Rules:
- Each fact should be a standalone statement (max 50 words)
- Be specific — include names, numbers, and concrete details
- Deduplicate — don't repeat the same fact in different words
- Extract 5-50 facts depending on document richness
- If the document has no useful company information, return an empty array

Respond in JSON format:
{ "facts": [{ "category": "...", "fact": "..." }, ...] }
```

**`max_completion_tokens`**: 16000 (generous budget for reasoning + up to 50 facts)

### 4.5 Controller (`company-context.controller.ts`)

All endpoints require `@OrgRoles('owner', 'admin')` — only org admins can manage company context.

| Method | Path | Description |
|---|---|---|
| `GET` | `/company-context` | Get current state: free-text + all documents with extraction status |
| `PUT` | `/company-context/text` | Update free-text company context (saves to `tenant.companyContext`) |
| `POST` | `/company-context/documents` | Upload a document (multipart/form-data) |
| `DELETE` | `/company-context/documents/:docId` | Delete a document (removes from S3 + DB) |
| `POST` | `/company-context/documents/:docId/re-extract` | Re-trigger extraction for a document |
| `GET` | `/company-context/resolved` | Get the fully resolved context (free-text + all facts) — used internally |

**Upload flow** (`POST /company-context/documents`):
1. Validate MIME type + file size + document count limit
2. Use `@UseInterceptors(FileInterceptor('file'))` from `@nestjs/platform-express` + `multer` for multipart parsing
3. Upload to Scaleway via storage service
4. Create `CompanyDocument` record with `extractionStatus: 'pending'`
5. Enqueue extraction job to BullMQ queue `company-context-extraction`
6. Return the document record immediately (extraction happens async)

**Re-extract flow** (`POST /company-context/documents/:docId/re-extract`):
1. Set `extractionStatus: 'pending'`, clear previous facts
2. Enqueue extraction job
3. Return updated document

### 4.6 BullMQ Worker

Add a new queue `company-context-extraction` processed by the existing worker service (`services/worker/src/index.ts`) or inline by the API (simpler, like memory extraction).

**Recommendation**: Process inline in the API service (like memory extraction uses BullMQ but processes in the same service). The extraction is a single LLM call per document — lightweight enough that a BullMQ queue is fine but an inline async approach also works.

**Job payload**:
```typescript
interface CompanyContextExtractionJob {
  tenantId: string;
  documentId: string;
}
```

**Worker logic**:
1. Fetch document metadata from DB
2. Download file content from Scaleway
3. Parse text (PDF/DOCX/TXT)
4. Call extraction service
5. Save extracted facts to document
6. Update extraction status to `completed` or `failed`

### 4.7 Module Registration

Register `CompanyContextModule` in `app.module.ts`. Imports:
- `ConfigModule` (for Scaleway + OpenAI keys)
- `TenantsModule` (for updating `tenant.companyContext`)
- `MongodbModule` (for DB access)

### 4.8 Internal API: `getResolvedContext(tenantId)`

The `CompanyContextService` exposes a method consumed by other services:

```typescript
async getResolvedContext(tenantId: string): Promise<ResolvedCompanyContext> {
  const tenant = await this.tenantsRepo.getById(tenantId);
  const facts = await this.companyDocsRepo.getAllFactsByTenant(tenantId);
  return {
    freeText: tenant?.companyContext || '',
    facts,
  };
}
```

**Caching**: Cache the resolved context in Redis with key `company-context:{tenantId}`, TTL 5 minutes. Invalidate on:
- PUT `/company-context/text` (free-text update)
- Extraction completion (new facts added)
- Document deletion

This avoids hitting MongoDB on every LLM call.

---

## 5. Context Injection — All LLM Call Points

This is the core value. Company context must be injected into every LLM system prompt.

### 5.1 Helper: `formatCompanyContext()`

**File**: `services/api/src/company-context/company-context.service.ts`

```typescript
formatCompanyContext(ctx: ResolvedCompanyContext): string {
  if (!ctx.freeText && ctx.facts.length === 0) return '';

  let result = '## Company Context\n';
  if (ctx.freeText) {
    result += `\n### About the Company\n${ctx.freeText}\n`;
  }
  if (ctx.facts.length > 0) {
    result += '\n### Key Company Facts\n';
    const grouped = groupBy(ctx.facts, f => f.category);
    for (const [category, facts] of Object.entries(grouped)) {
      result += `\n**${capitalize(category)}**:\n`;
      for (const f of facts) {
        result += `- ${f.fact}\n`;
      }
    }
  }
  return result;
}
```

### 5.2 Injection Points

Every service that makes LLM calls needs to:
1. Import `CompanyContextService`
2. Call `getResolvedContext(tenantId)` (cached in Redis)
3. Append the formatted company context to the system prompt

Here are **all 6 LLM call sites** that need modification:

#### A. ChatService (`services/api/src/chat/chat.service.ts`)

- **LLM**: Gemini (`gemini-3.1-flash-lite-preview`)
- **Current system prompt**: Static `SYSTEM_PROMPT` constant (generic AI knowledge assistant)
- **Change**: Inject `tenantId` from request context → fetch company context → append to system prompt
- **Requires**: ChatService needs access to `tenantId`. Currently the controller has `@TenantId()`, so pass it through to the service method.

```diff
 // chat.service.ts
+constructor(
+  ...,
+  private readonly companyContextService: CompanyContextService,
+) {}

-async chat(userId: string, message: string, history: ...): Promise<...> {
+async chat(userId: string, tenantId: string, message: string, history: ...): Promise<...> {
+  const companyCtx = await this.companyContextService.getFormattedContext(tenantId);
+  const systemPrompt = SYSTEM_PROMPT + (companyCtx ? `\n\n${companyCtx}` : '');
   // ... use systemPrompt instead of SYSTEM_PROMPT
```

#### B. AiPlannerService — `generateQuestions()` (`services/api/src/ai-planner/ai-planner.service.ts`)

- **LLM**: Grok (`grok-4-1-fast-reasoning`)
- **Current system prompt**: Planning consultant asking yes/no questions
- **Change**: Append company context so questions are domain-aware
- **Requires**: Pass `tenantId` from controller

```diff
 const systemMessage = `You are a friendly AI planning consultant...
+
+${companyContext}
 `;
```

#### C. AiPlannerService — `generateStrategy()` (`services/api/src/ai-planner/ai-planner.service.ts`)

- **LLM**: OpenAI (`gpt-5.2`) or Grok
- **Current system prompt**: Strategy generation with model recommendations
- **Change**: Append company context so strategies reference company-specific tools, processes, and terminology
- **Requires**: Same `tenantId` from controller

#### D. PromptOptimizerService — `analyzePrompt()` (`services/api/src/prompt-optimizer/prompt-optimizer.service.ts`)

- **LLM**: Grok (`grok-4-1-fast-reasoning`)
- **Current system prompt**: Prompt quality analysis + goal extraction
- **Change**: Append company context so goals and analysis consider company domain
- **Requires**: Pass `tenantId` from controller

#### E. PromptOptimizerService — `optimizePrompt()` (`services/api/src/prompt-optimizer/prompt-optimizer.service.ts`)

- **LLM**: Grok (`grok-4-1-fast-reasoning`)
- **Current system prompt**: Prompt rewriting with best practices
- **Change**: Append company context so optimized prompts include company-relevant details
- **Requires**: Same `tenantId` from controller

#### F. ArticleRecsService — `selectArticleForUser()` (`services/api/src/article-recs/article-recs.service.ts`)

- **LLM**: OpenAI (`gpt-5.2-mini`)
- **Current system prompt**: Personalized article selection using user memory
- **Change**: Append company context so article selection favors company-relevant topics
- **Requires**: `tenantId` is already available (from user record)

### 5.3 Injection Pattern

For all 6 points above, the pattern is identical:

```typescript
// 1. Get formatted context (cached, fast)
const companyCtx = await this.companyContextService.getFormattedContext(tenantId);

// 2. Append to system prompt
const fullSystemPrompt = baseSystemPrompt + (companyCtx ? `\n\n${companyCtx}` : '');
```

### 5.4 Services NOT Needing Changes

- **MemoryExtractionService** — Extracts user facts from user input. Company context is NOT relevant here (it would confuse the extraction). Leave unchanged.
- **Worker service** (`services/worker/src/index.ts`) — Only processes BullMQ jobs; delegates to services above. No direct LLM calls.
- **KB Builder** (`services/kb-builder`) — Processes public articles, not company-specific. No change needed.

---

## 6. Frontend — Company Settings Page

### 6.1 New Route

**File**: `apps/web/src/routes/org/company-context/+page.svelte`

This adds a new tab in the existing Organization layout (`/org/*`).

### 6.2 Update Org Layout Tabs

**File**: `apps/web/src/routes/org/+layout.svelte`

Add the new tab:

```typescript
const tabs = [
  { label: 'Overview', href: '/org', icon: '🏢' },
  { label: 'Members', href: '/org/members', icon: '👥' },
  { label: 'Invitations', href: '/org/invitations', icon: '📩' },
  { label: 'Company Context', href: '/org/company-context', icon: '📋' }, // NEW
  { label: 'Billing', href: '/org/billing', icon: '💳' },
  { label: 'Usage', href: '/org/usage', icon: '📊' },
];
```

### 6.3 Also Add Sidebar Link

**File**: `apps/web/src/lib/components/Sidebar.svelte`

In the Organization section (gated by `isOrgAdmin`), add:

```svelte
<a href="/org/company-context" class="...">
  <span>📋</span>
  Company Settings
</a>
```

### 6.4 Page Layout

The `/org/company-context` page has two sections:

#### Section A: Free-Text Company Context

- **Textarea** (large, min-height ~200px) with the admin-authored company description
- **Save button** — calls `PUT /company-context/text`
- **Helper text**: "Describe your company, its products, industry, culture, and strategic priorities. This context will be injected into all AI interactions for your team members."
- Auto-save debounce (optional, nice-to-have)

#### Section B: Uploaded Documents

- **Upload area** — Drag & drop zone + file picker button
  - Accepts: PDF, DOCX, TXT, MD
  - Max 10 MB per file
  - Shows upload progress
- **Document list** — Table/cards showing:
  - Filename
  - Upload date
  - File size
  - Extraction status badge: `pending` (yellow), `processing` (blue spinner), `completed` (green), `failed` (red)
  - Number of extracted facts (if completed)
  - Actions: **View Facts** (expand/modal), **Re-extract** (button), **Delete** (confirm dialog)
- **Extracted facts view** — When clicking "View Facts" on a document:
  - Grouped by category
  - Read-only display
  - Shows category label + fact text

#### UI Mockup (ASCII)

```
┌──────────────────────────────────────────────────────┐
│ Organization > Company Context                        │
├──────────────────────────────────────────────────────┤
│                                                       │
│ Company Description                                   │
│ ┌──────────────────────────────────────────────────┐ │
│ │ We are Mito, a Hungarian digital agency           │ │
│ │ specializing in AI-powered marketing solutions... │ │
│ │                                                    │ │
│ │                                                    │ │
│ └──────────────────────────────────────────────────┘ │
│ [💾 Save]                          Last saved: 2m ago │
│                                                       │
│ ─────────────────────────────────────────────────── │
│                                                       │
│ Company Documents                                     │
│                                                       │
│ ┌────────────────────────────────────────────┐       │
│ │  📄 Drop files here or click to upload      │       │
│ │     PDF, DOCX, TXT, MD — max 10MB          │       │
│ └────────────────────────────────────────────┘       │
│                                                       │
│ ┌────────────────────────────────────────────────┐   │
│ │ company-handbook.pdf   2.3 MB  ✅ 23 facts     │   │
│ │ Jan 15, 2026         [View] [Re-extract] [🗑️]  │   │
│ ├────────────────────────────────────────────────┤   │
│ │ strategy-2026.docx    890 KB  🔄 Processing... │   │
│ │ Feb 28, 2026                             [🗑️]  │   │
│ ├────────────────────────────────────────────────┤   │
│ │ glossary.md           12 KB   ❌ Failed         │   │
│ │ Mar 1, 2026          [Re-extract]        [🗑️]  │   │
│ └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

---

## 7. New Dependencies

| Package | Purpose | Where |
|---|---|---|
| `@aws-sdk/client-s3` | Scaleway Object Storage (S3-compatible) | `services/api` |
| `pdf-parse` | Extract text from PDF files | `services/api` |
| `mammoth` | Extract text from DOCX files | `services/api` |
| `multer` | Already available via `@nestjs/platform-express` | `services/api` |

---

## 8. Seed Script & Indexes

### 8.1 MongoDB Indexes

**File**: `scripts/seed-db.ts`

Add:

```typescript
// company_documents collection indexes
await db.collection('company_documents').createIndex(
  { tenantId: 1, createdAt: -1 },
  { name: 'tenantId_createdAt' }
);
await db.collection('company_documents').createIndex(
  { tenantId: 1, extractionStatus: 1 },
  { name: 'tenantId_extractionStatus' }
);
```

---

## 9. Files to Create

| # | File | Description |
|---|---|---|
| 1 | `packages/shared/src/types/company-context.ts` | Shared types: `CompanyDocument`, `CompanyFact`, `ResolvedCompanyContext` |
| 2 | `services/api/src/company-context/company-context.module.ts` | NestJS module |
| 3 | `services/api/src/company-context/company-context.controller.ts` | REST endpoints (6 endpoints) |
| 4 | `services/api/src/company-context/company-context.service.ts` | Business logic + context resolution + caching |
| 5 | `services/api/src/company-context/company-context.repository.ts` | MongoDB for `company_documents` |
| 6 | `services/api/src/company-context/company-document-storage.service.ts` | Scaleway S3 operations |
| 7 | `services/api/src/company-context/company-context-extraction.service.ts` | LLM fact extraction |
| 8 | `apps/web/src/routes/org/company-context/+page.svelte` | Frontend page |

## 10. Files to Modify

| # | File | Change |
|---|---|---|
| 1 | `packages/shared/src/types/tenant.ts` | Add `companyContext?: string` to `Tenant` |
| 2 | `packages/shared/src/index.ts` | Export new types from `company-context.ts` |
| 3 | `services/api/src/app.module.ts` | Register `CompanyContextModule` |
| 4 | `services/api/src/chat/chat.service.ts` | Inject company context into Gemini system prompt |
| 5 | `services/api/src/chat/chat.controller.ts` | Pass `tenantId` to service |
| 6 | `services/api/src/ai-planner/ai-planner.service.ts` | Inject company context into Grok prompt (both `generateQuestions` and `generateStrategy`) |
| 7 | `services/api/src/ai-planner/ai-planner.controller.ts` | Pass `tenantId` to service methods |
| 8 | `services/api/src/prompt-optimizer/prompt-optimizer.service.ts` | Inject company context into Grok prompt (both `analyzePrompt` and `optimizePrompt`) |
| 9 | `services/api/src/prompt-optimizer/prompt-optimizer.controller.ts` | Pass `tenantId` to service methods |
| 10 | `services/api/src/article-recs/article-recs.service.ts` | Inject company context into `selectArticleForUser` prompt |
| 11 | `apps/web/src/routes/org/+layout.svelte` | Add "Company Context" tab |
| 12 | `apps/web/src/lib/components/Sidebar.svelte` | Add "Company Settings" link in Organization section |
| 13 | `scripts/seed-db.ts` | Add `company_documents` indexes |
| 14 | `.env.example` | Add Scaleway env vars |

---

## 11. Implementation Order

| Phase | Tasks | Dependencies |
|---|---|---|
| **Phase 1** | Shared types + Tenant schema update | None |
| **Phase 2** | Repository + Storage service (Scaleway S3) | Phase 1 |
| **Phase 3** | Extraction service (LLM) | Phase 2 |
| **Phase 4** | Controller + Service (REST API) | Phase 2 + 3 |
| **Phase 5** | Module registration + seed indexes | Phase 4 |
| **Phase 6** | Context injection into all 6 LLM call sites | Phase 4 |
| **Phase 7** | Frontend page + sidebar/tab updates | Phase 4 |
| **Phase 8** | Testing + validation | All phases |

---

## 12. Testing Strategy

| Layer | What to Test |
|---|---|
| **Unit** | Extraction prompt parsing, fact deduplication, `formatCompanyContext()` output |
| **Integration** | Upload → extract → resolve flow, Redis cache invalidation |
| **Manual** | Upload real PDF/DOCX → verify facts → check injection in Chat/Planner/Optimizer |

---

## 13. Security Considerations

1. **Tenant isolation**: All endpoints enforce `@TenantId()` — a tenant can only access its own documents
2. **File validation**: Validate MIME type on upload (don't trust Content-Type header alone — check magic bytes for PDF)
3. **Scaleway bucket policy**: Private bucket, no public access
4. **Max limits**: 10 MB per file, 20 files per tenant — prevents abuse
5. **No user PII in extraction**: The extraction prompt explicitly asks for company facts, not personal information

---

## 14. Performance Considerations

1. **Redis caching**: Resolved company context is cached for 5 minutes — prevents N+1 queries on every LLM call
2. **Async extraction**: Document extraction happens via BullMQ job — upload returns immediately
3. **Context size budget**: Cap the total injected context at ~2000 tokens to avoid bloating LLM prompts. If free-text + facts exceed this, truncate facts by recency.
4. **Lazy loading**: Only fetch company context when the LLM call is about to happen (not preloaded on every request)

---

## 15. Open Questions

1. **Should extracted facts be editable by admins?** (Currently read-only — admin can only re-extract.) Adding per-fact edit/delete adds complexity but improves control.
2. **Should the company context be visible to regular users?** (Currently admin-only page.) Could add a read-only view.
3. **Should we support extracting from URLs** (paste a URL, we fetch + extract)? Adds scope but is synergistic with KB Builder.
4. **Cost tracking**: Should document extraction LLM calls count against the tenant's LLM quota? Recommended: yes, track as an `agent-run` with type `company-context-extraction`.
