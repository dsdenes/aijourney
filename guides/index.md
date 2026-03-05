# INDEX.md — Guide Router for GenAI Agents

This index exists so an agent can **deterministically choose the next document to read** (and in what order) based on the task at hand.

---

## 0) Operating rule (MUST)

1. **Classify the user’s request into exactly one primary domain**:
   - **RAG** (retrieval-augmented generation)
   - **App engineering** (Node.js / Svelte / queues / observability / Rust workers)
   - **Tooling** (AWS CLI / GitLab CLI / Copilot SDK)
   - **Delivery stage** (MVP vs production)

2. **Read exactly one “primary” guide first** (selected below).
   You MAY read “secondary” guides only if the primary guide implies dependencies (example: RAG stack → retrieval → embedding → chunking).

3. **If the request is ambiguous, you MUST default to the simplest viable baseline** and record assumptions (do not block on clarifications unless unavoidable).

---

## 1) Document inventory (relative paths; same directory)

### RAG

- [`./rag-tech-ctack.md`](./rag-tech-ctack.md)
- [`./rag-retrieval.md`](./rag-retrieval.md)
- [`./rag-embedding.md`](./rag-embedding.md)
- [`./rag-chunking.md`](./rag-chunking.md)

### App engineering

- [`./mvp-prod.md`](./mvp-prod.md)
- [`./nodejs-rest-api.md`](./nodejs-rest-api.md)
- [`./queue.md`](./queue.md)
- [`./nodejs-observability.md`](./nodejs-observability.md)
- [`./rust-workers.md`](./rust-workers.md)
- [`./svelte.md`](./svelte.md)

### Tooling

- [`./aws-cli.md`](./aws-cli.md)
- [`./gitlab-cli.md`](./gitlab-cli.md)
- [`./copilot-sdk.md`](./copilot-sdk.md)

---

## 2) Primary decision tree (pick the first match)

### A) RAG work (anything “RAG / vector db / retrieval / embeddings / chunking”)

1. If the user asks **“what stack / which DB / where does retrieval live / products”** → read:
   - `./rag-tech-ctack.md`

2. If the user asks **“BM25 vs dense / hybrid / RRF / rerank / SPLADE / ColBERT / recall vs precision”** → read:
   - `./rag-retrieval.md`

3. If the user asks **“which embedding model / query vs doc conventions / dimensions / multilingual embeddings / re-embedding strategy”** → read:
   - `./rag-embedding.md`

4. If the user asks **“chunk size / stable chunk IDs / semantic chunking / overlap / sentence window / late chunking”** → read:
   - `./rag-chunking.md`

**RAG recommended reading order (SHOULD)**
Stack decision → Retrieval pipeline → Embedding subsystem → Chunking strategy
`rag-tech-ctack` → `rag-retrieval` → `rag-embedding` → `rag-chunking`

---

### B) App engineering (building software, not specifically RAG)

1. If the user asks **“MVP vs production / what’s required / what NOT to build yet”** → read:
   - `./mvp-prod.md`

2. If the user asks **“build a REST API / NestJS / Node.js 24 / OpenAPI-first / Zalando guidelines”** → read:
   - `./nodejs-rest-api.md`

3. If the user asks **“queueing / background jobs / BullMQ / retries / idempotency / delayed jobs / durable execution”** → read:
   - `./queue.md`

4. If the user asks **“observability / OpenTelemetry / traces+metrics+logs / alerting / collector / SLO-ish”** → read:
   - `./nodejs-observability.md`

5. If the user asks **“CPU-heavy tasks / offload to Rust / worker patterns (sidecar/queue/FFI) / backpressure”** → read:
   - `./rust-workers.md`

6. If the user asks **“Svelte / SvelteKit / app structure / testing / state management”** → read:
   - `./svelte.md`

**App recommended reading order (SHOULD)**
Stage rule first, then build guides:
`mvp-prod` → (API or UI) → `queue` (if async) → `nodejs-observability` (if production-ish triggers) → `rust-workers` (if CPU-bound)

---

### C) Tooling (operating external systems via CLI/SDK)

1. If the user asks **“AWS CLI / profiles / sts get-caller-identity / non-interactive / JSON output / SSO”** → read:
   - `./aws-cli.md`

2. If the user asks **“GitLab CLI (glab) / MRs / issues / pipelines / auth tokens / non-interactive automation”** → read:
   - `./gitlab-cli.md`

3. If the user asks **“Copilot SDK / agent runs from code / sessions / audit logs / model policy / subagents”** → read:
   - `./copilot-sdk.md`

---

## 3) Keyword router (fast path)

- **“vector db / pgvector / Qdrant / Weaviate / Milvus / Pinecone / OpenSearch vector”** → `./rag-tech-ctack.md`
- **“BM25 / hybrid / RRF / reranker / SPLADE / ColBERT / HNSW / Faiss”** → `./rag-retrieval.md`
- **“embedding model / dimensions / query: passage: / input_type / re-embed / multilingual”** → `./rag-embedding.md`
- **“chunk size / overlap / stable chunk id / semantic chunking / late chunking”** → `./rag-chunking.md`
- **“MVP / production-ready / GA / SLO / on-call”** → `./mvp-prod.md`
- **“NestJS / OpenAPI / REST maturity / Zalando”** → `./nodejs-rest-api.md`
- **“BullMQ / queues / delayed jobs / retries / idempotency / durable execution”** → `./queue.md`
- **“OpenTelemetry / OTLP / collector / tracing / metrics / logs / alerts”** → `./nodejs-observability.md`
- **“Rust worker / CPU offload / sidecar / gRPC / N-API / wasm”** → `./rust-workers.md`
- **“SvelteKit / Svelte / load functions / actions / Playwright”** → `./svelte.md`
- **“aws sts / profiles / --no-cli-pager / JMESPath”** → `./aws-cli.md`
- **“glab auth / MR / pipeline / CI_JOB_TOKEN”** → `./gitlab-cli.md`
- **“CopilotClient / sessions / audit log / subagents / model multiplier”** → `./copilot-sdk.md`

---

## 4) “Read-next” rules for combined tasks (common composites)

1. **“Build a RAG system”**
   `rag-tech-ctack` → `rag-retrieval` → `rag-embedding` → `rag-chunking`

2. **“Build an agent runner with durable execution”**
   `copilot-sdk` → `queue` → `nodejs-observability` → (optional) `mvp-prod`

3. **“Build a Node.js API that uses queues”**
   `mvp-prod` → `nodejs-rest-api` → `queue` → (optional) `nodejs-observability`

4. **“We have CPU-heavy steps in Node”**
   `rust-workers` → (optional) `queue` → (optional) `nodejs-observability`

---

## 5) Agent output contract (MUST)

After reading the selected primary guide, the agent MUST produce:

- A short decision summary (what was chosen and why)
- Explicit assumptions (only what’s missing)
- A minimal implementation plan aligned to the guide’s MUST/SHOULD rules
- References to any secondary guides it decided to read next (if any)
