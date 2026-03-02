## Embedding in RAG: what it is (and what can go wrong)

An embedding model maps text → a fixed-length vector so you can do similarity search (nearest neighbors). In RAG you typically have:

* **Index-time**: embed *chunks* (and store vectors + metadata in a vector index).
* **Query-time**: embed *the user query* (or query variants), retrieve nearest chunk vectors, then feed retrieved text to the generator.

**Most common embedding failure mode**: you embed documents and queries with *incompatible conventions* (wrong prefix/instruction, different normalization, different model/version), so “similar” content is no longer close in vector space.

---

## Hard requirements (MUST)

Your embedding subsystem MUST be **deterministic, versioned, and reproducible**.

**You MUST persist these fields with every stored vector:**

* `embedding_model_id` (exact name + provider)
* `embedding_model_version` (or release hash if available)
* `dimensions` (vector length)
* `similarity_metric` (cosine / dot / L2)
* `text_normalization_version`
* `chunking_version` (even if chunking is “out of scope”, it affects embeddings)
* `input_convention` (e.g., `query:`/`passage:` prefixes, `input_type=search_query`, etc.)

**You MUST support re-embedding as a first-class operation** (batch jobs, canary, rollback).

---

## Decision tree (embedding-specific)

### Step 1 — Choose retrieval geometry (dense vs sparse vs multi-vector)

1. **Dense embeddings (default)**

   * Best general-purpose choice; required for semantic search and paraphrase matching.

2. **Learned sparse embeddings / lexical** (optional)

   * Useful when exact tokens dominate (IDs, error codes, SKUs).
   * If you don’t have explicit need, skip and rely on hybrid retrieval later.

3. **Multi-vector / late-interaction** (advanced)

   * Higher quality on nuanced matching; higher index/storage/query cost.

**Rule**: start with **dense**; add sparse or multi-vector only if evaluation shows a clear miss pattern you can’t fix with chunking/querying/reranking.

---

### Step 2 — Symmetric vs asymmetric embedding (query ≠ document)

* **Asymmetric embedding** is designed for “short query → longer passage” retrieval. Many models require explicit conventions (prefixes or parameters).

  * Example: **E5** models are trained with `query: ...` vs `passage: ...`; skipping this typically hurts retrieval. ([Hugging Face][1])
  * Example: some hosted models require `input_type` such as `search_query` vs `search_document`. ([docs.pinecone.io][2])

**You MUST follow the model’s training convention** for query vs document inputs, or your benchmark numbers are meaningless.

---

### Step 3 — Hosted API vs self-hosted (latency/cost/compliance)

**Hosted (API) embeddings**

* Pros: strong quality, low ops burden, usually best time-to-value.
* Cons: per-token cost, data egress/compliance constraints.

**Self-hosted / local**

* Pros: data stays in your infra; predictable cost at scale; full control.
* Cons: GPU/CPU cost, throughput engineering, model lifecycle burden.

**Rule**: if compliance allows, start hosted; if volume/compliance forces it, go self-hosted.

---

### Step 4 — Language & domain constraints

* If you need **multilingual / cross-lingual retrieval**, you SHOULD use a multilingual embedding model instead of translating everything.

  * Example: Cohere states their multilingual embed model supports 100+ languages. ([docs.cohere.com][3])
  * Example: **BGE-M3** is positioned as multilingual and multi-function (dense/sparse/multi-vector). ([arXiv][4])

* If you have **domain-specific language** (legal, medical, code):

  * You SHOULD consider domain-tuned embeddings or fine-tuning (only after baseline evaluation).

---

## Practical model buckets (with selection rules)

### Bucket A — “Just ship it” (hosted, high-quality general embeddings)

* OpenAI `text-embedding-3-small` / `text-embedding-3-large`

  * Default vector lengths: **1536** (small) and **3072** (large), and some providers support reducing dimensions via a parameter. ([OpenAI Developers][5])
  * Use when: you want strong baseline quality, simple integration, and acceptable data policy.

### Bucket B — Multilingual hosted embeddings

* Cohere Embed multilingual v3 family

  * Use when: multilingual content + query language mismatch is common. ([docs.cohere.com][3])
  * MUST set correct query/document input typing if the platform/model requires it. ([docs.pinecone.io][2])

* Voyage AI embeddings (instruction-tuned)

  * Some Voyage docs recommend setting `input_type` for query vs document. ([Voyage AI][6])
  * Use when: you want top-tier retrieval embeddings and can use their API/tooling.

### Bucket C — Strong open-source baselines (self-hostable)

* **E5 (multilingual variants)**

  * MUST apply `query:` / `passage:` prefixes as trained. ([Hugging Face][1])
  * Use when: you want a reliable OSS baseline, good multilingual performance.

* **BGE-M3** (dense + sparse + multi-vector in one model family)

  * Use when: you want a single model that can cover multiple retrieval modes. ([arXiv][4])

* **Jina Embeddings v2** (longer context variants exist)

  * Use when: long inputs matter and you want self-hostable options. ([Hugging Face][7])

---

## Input formatting rules (this is where most systems silently fail)

### Document/chunk embedding (MUST)

You MUST embed **exactly what you will retrieve and show the LLM** (or a deterministic transform of it).

Recommended chunk text template (example):

* `title: <doc title>`
* `section: <H1 > H2 path>`
* `content: <chunk text>`
* optional `tags: <controlled metadata>`

**Rules**

* You MUST keep the template stable and version it.
* You MUST avoid injecting volatile metadata (timestamps, random IDs) into the embedded text.
* You SHOULD include headings/section path because it improves disambiguation at retrieval time (especially for docs with repeated phrasing).

### Query embedding (MUST)

You MUST apply the model’s query convention:

* E5-style: `query: <user question>` ([Hugging Face][1])
* API models that require it: `input_type=search_query` ([docs.pinecone.io][2])

You SHOULD wrap the query in a stable intent template if your queries are short/underspecified, e.g.:

* `Find passages that answer: <q>`
  This can improve alignment for instruction-tuned embeddings, but you MUST evaluate it (don’t assume).

---

## Vector length (dimensions), normalization, and similarity metric

### Dimensions

* More dimensions often help quality, but increase storage and latency.
* Some APIs expose dimension reduction; if you use it, you MUST treat it as a different embedding config and re-evaluate. ([OpenAI Developers][5])

### Similarity metric

* You MUST choose and standardize one metric:

  * **Cosine** (most common)
  * **Dot product** (often used with normalized vectors)
  * **L2** (sometimes used; depends on model/index)

**Rule**: if you normalize vectors (common), cosine and dot become closely related; if you don’t, dot can be dominated by vector norms.

---

## Advanced embedding techniques (use only with evidence)

### 1) Contextualized chunk embeddings

Some approaches embed a chunk while conditioning on broader document context (e.g., “chunk + doc summary + neighbors”). This can reduce “orphan chunk” ambiguity.

**You SHOULD** try this when:

* chunks are short and depend heavily on surrounding context,
* you see false positives between similarly worded sections.

### 2) Domain adaptation / fine-tuning (contrastive)

Fine-tuning embeddings can help, but it’s easy to overfit.

You SHOULD fine-tune only if:

* you have **(query, relevant_doc)** pairs (or can generate high-quality pairs),
* baseline embeddings plateau and misses are domain-semantic (not chunking issues).

You MUST include:

* hard negatives (near-miss docs)
* held-out evaluation set that resembles production traffic

### 3) Hybrid with learned sparse

If your corpus has many identifiers/numbers, learned sparse + dense can improve recall. If you go here:

* You MUST run ablations to prove benefit vs “BM25 + dense rerank”.

---

## Evaluation: embedder selection MUST be driven by retrieval metrics

You SHOULD evaluate candidate embedders on:

* **Recall@K** (e.g., K=20/50/100)
* **MRR / nDCG@K** (ranking quality)
* Slice metrics by language, doc type, and query intent

Use public frameworks/benchmarks for sanity checks, but prioritize your own queries.

* MTEB is a commonly used embedding evaluation benchmark and paper; it highlights that no single embedding method dominates across all tasks. ([ACL Anthology][8])

**You MUST maintain an “evaluation pack”** (frozen queries + relevance labels + scripts) and run it:

* before switching embedding models,
* before changing chunk templates,
* before changing dimensions/normalization.

---

## Operational playbook (MUST/SHOULD)

### Versioning + rollout

* You MUST support **dual indexing** (`index_v1`, `index_v2`) during model migration.
* You SHOULD do **canary queries**: route 1–5% of traffic to new embeddings, compare retrieval overlap + downstream answer quality.

### Caching and batching

* You MUST batch embedding calls to maximize throughput and cost efficiency (where supported).
* You SHOULD cache embeddings for identical inputs (hash the normalized text + model id + template version).

### Re-embed triggers

You MUST re-embed when any of these changes:

* embedding model or version
* text normalization
* chunk template
* dimensions
* tokenizer behavior (if applicable)

---

## Embedding “acceptance criteria” (what agents should enforce)

A RAG embedding subsystem is acceptable only if:

1. **Reproducibility**: the same input yields the same vector (within numeric tolerance) given identical config.
2. **Traceability**: every vector can be traced to `(raw_text, normalized_text, config_versions)`.
3. **Offline quality**: meets target recall@K on your evaluation pack.
4. **Slice stability**: no catastrophic regression for any key slice (language/domain/source).
5. **Migration safety**: can dual-run and rollback without re-indexing everything manually.

---

## Minimal agent runbook (do this in order)

1. Collect constraints: languages, query types, privacy, throughput, latency, budget.
2. Choose 3–5 candidate embedders (1 hosted baseline + 1 multilingual + 1 OSS).
3. Define the **document and query formatting templates** (version them).
4. Build evaluation pack (≥200 real queries if possible; otherwise synthesize + human check).
5. Run retrieval evaluation (Recall@50/100, MRR).
6. Pick winner + 2nd place (fallback).
7. Implement embedding pipeline with strict config/version metadata.
8. Ship with canary + dual index + rollback plan.

[1]: https://huggingface.co/intfloat/multilingual-e5-large?utm_source=chatgpt.com "intfloat/multilingual-e5-large"
[2]: https://docs.pinecone.io/models/cohere-embed-multilingual-v3.0?utm_source=chatgpt.com "embed-multilingual-v3.0 | Cohere - Pinecone documentation"
[3]: https://docs.cohere.com/docs/cohere-embed?utm_source=chatgpt.com "Cohere's Embed Models (Details and Application)"
[4]: https://arxiv.org/abs/2402.03216?utm_source=chatgpt.com "BGE M3-Embedding: Multi-Lingual, Multi-Functionality, Multi-Granularity Text Embeddings Through Self-Knowledge Distillation"
[5]: https://developers.openai.com/api/docs/guides/embeddings/?utm_source=chatgpt.com "Vector embeddings | OpenAI API"
[6]: https://docs.voyageai.com/docs/embeddings?utm_source=chatgpt.com "Text Embeddings - Introduction - Voyage AI"
[7]: https://huggingface.co/jinaai/jina-embeddings-v2-base-en?utm_source=chatgpt.com "jinaai/jina-embeddings-v2-base-en"
[8]: https://aclanthology.org/2023.eacl-main.148/?utm_source=chatgpt.com "MTEB: Massive Text Embedding Benchmark"
