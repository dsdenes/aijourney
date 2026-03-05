## Retrieval goals (what “good” means)

A retrieval subsystem **MUST** optimize for:

- **High recall under tight latency** (find _all_ plausible evidence fast, then let re-ranking decide).
- **Robustness to wording variance** (synonyms, paraphrases, typos).
- **Deterministic behavior under constraints** (filters, ACL, recency, languages).
- **Measurability** (offline + online metrics, plus segmented debugging).

A retrieval subsystem **SHOULD** be designed as a pipeline:

1. **Query understanding** → 2) **Candidate generation (high recall)** → 3) **Fusion** → 4) **Re-ranking** → 5) **Top-N passages**

---

## Decision tree (choose your retrieval stack)

Use this as a literal decision procedure.

### Step 1 — Classify your query distribution

**If queries contain many exact identifiers** (error codes, SKUs, ticket IDs, API names, proper nouns):

- **MUST include lexical retrieval (BM25)**. BM25 is a strong baseline for exact matching. ([Microsoft][1])

**If queries are mostly natural language** (“how do I…”, “why is…”, paraphrased):

- **MUST include semantic retrieval (dense vectors)** (or learned sparse / late interaction if you can afford it).

**If you have both** (most real systems):

- **MUST do hybrid retrieval** (lexical + semantic), then fuse and re-rank. ([docs.opensearch.org][2])

### Step 2 — Pick the primary candidate generator(s)

Choose one of these candidate pools (you can combine them):

1. **Lexical / sparse (BM25)**
   Use when exact token overlap matters, and as a “recall safety net”. BM25 is the default similarity in Elasticsearch, with commonly used defaults like `k1≈1.2`, `b≈0.75`. ([Elastic][3])

2. **Dense embedding retrieval (ANN over vectors)**
   Use when semantic similarity matters and paraphrasing is common. Implement via ANN indexes like **HNSW** (graph-based) or IVF/PQ (in Faiss). HNSW is a standard high-recall/low-latency choice; Faiss is a widely used vector search library with multiple index types and GPU acceleration options. ([arXiv][4])

3. **Learned sparse retrieval (SPLADE-style)**
   Use when you want lexical-style inverted-index benefits **plus** semantic expansion/term weighting learned by a model. This often improves robustness while keeping “lexical-like” retrieval mechanics. ([arXiv][5])

4. **Late interaction (ColBERT / ColBERTv2-style)**
   Use when you need stronger matching than single-vector dense retrieval, and can afford higher index/storage and compute. ColBERT explicitly uses token-level interactions (late interaction) for effectiveness. ([arXiv][6])

**Default recommendation (production-pragmatic):**

- Start with **BM25 + dense vectors**, then add **RRF fusion** and a **cross-encoder reranker**. This is usually the best cost/quality frontier before SPLADE/ColBERT. (See steps below.)

### Step 3 — Decide how you’ll fuse multiple retrievers

If you combine BM25 + dense (and maybe more), you need fusion.

**You SHOULD default to Reciprocal Rank Fusion (RRF)** because it is simple, robust to score scale mismatch, and empirically strong. ([cormack.uwaterloo.ca][7])

- RRF combines ranked lists by summing something like `1 / (k + rank)` across systems; higher consensus → higher final rank. ([cormack.uwaterloo.ca][7])
- This is particularly useful when mixing BM25 and semantic scores that aren’t directly comparable. ([OpenSearch][8])

If you are on OpenSearch, there is first-class hybrid + RRF support in modern versions (via neural search / pipelines). ([docs.opensearch.org][2])

### Step 4 — Decide whether you need re-ranking

Re-ranking is where you buy precision.

**You MUST add a re-ranker** if any of these are true:

- Your corpus is large/noisy (logs, wikis, tickets, long PDFs).
- Your “top-K” candidates often include near-misses.
- You need better “top-3/top-5” quality than “top-50” recall.

**Cross-encoder re-ranking (BERT-style)** is a standard strong choice: it directly scores (query, passage) pairs and is known to materially improve ranking quality. ([arXiv][9])

---

## Technique playbook (what to do, and why)

### 1) Lexical retrieval (BM25) — how to make it not suck

**BM25 setup MUST include:**

- Appropriate **tokenization** and **normalization** (case-folding, Unicode normalization).
- Domain-aware **analyzers** (e.g., keep `SeatDynamicPricingClient` as a token; don’t destroy IDs).
- Field strategy: title/heading vs body with boosts (if your engine supports it).

**BM25 tuning SHOULD be last**, not first:

- Defaults (`k1`, `b`) are often fine; fix analyzers, fields, and content structure before parameter chasing. ([Elastic][10])

**BM25 MUST support phrase/proximity queries** if your domain contains “nearly exact” sequences (error messages, legal citations). (Most Lucene-based stacks can do this via query types.)

### 2) Dense retrieval (vectors) — make ANN predictable

**Dense retrieval MUST define:**

- embedding model
- similarity metric (cosine / dot / L2)
- ANN index type and parameters

**Index choice (rule of thumb):**

- **HNSW** when you want high recall, easy ops, and fast incremental inserts; it’s a widely used graph-based ANN method. ([arXiv][4])
- **Faiss IVF/PQ variants** when you want memory/latency tradeoffs, and especially if you want GPU acceleration or billion-scale patterns. ([arXiv][11])

**ANN tuning MUST be treated as a recall/latency dial:**

- Increase search effort (e.g., HNSW `efSearch`) to improve recall at higher latency.
- Set a retrieval budget: “p95 retrieval latency ≤ X ms” and tune to it.

### 3) Learned sparse (SPLADE) — when BM25 isn’t enough but you like inverted indexes

SPLADE-style retrieval learns sparse vectors over the vocabulary and can act like an “expanded lexical” retriever with strong effectiveness. ([arXiv][5])

**Use SPLADE when:**

- Exact matching matters **and** users paraphrase heavily.
- You can afford extra model compute at indexing time (and sometimes query time).

**Operational note:** learned sparse still typically plugs into inverted-index style retrieval, which many teams find operationally familiar (compared to purely vector-native stacks). (Implementation varies by stack.)

### 4) Late interaction (ColBERT) — when you need token-level matching power

ColBERT encodes query and document tokens and uses late interaction to score matches efficiently compared to full cross-encoding everything. ([arXiv][6])
ColBERTv2 targets quality + space improvements with compression/denoising ideas. ([ACL Anthology][12])

**Use ColBERT when:**

- Dense single-vector retrieval misses nuanced relevance.
- You can afford larger indexes and more complex retrieval infra.

---

## Query expansion for retrieval robustness (agent-friendly defaults)

### Multi-query retrieval + fusion (RAG-Fusion pattern)

**You SHOULD generate multiple query variants** (paraphrases, decompositions), retrieve per-variant, then fuse with RRF.

- This increases recall and reduces sensitivity to phrasing.
- The fusion step can be implemented exactly as RRF. ([cormack.uwaterloo.ca][7])

### HyDE (Hypothetical Document Embeddings)

HyDE generates a hypothetical “ideal” document for the query, embeds it, and retrieves real docs near that embedding. It’s explicitly proposed for strong zero-shot dense retrieval without relevance labels. ([arXiv][13])

**HyDE SHOULD be considered when:**

- You have weak/no relevance labels.
- Your dense retriever is underperforming zero-shot.
- You can afford an LLM call for query expansion.

**Safety note:** HyDE’s hypothetical text can be wrong; it’s used only as a retrieval pivot, then grounded by nearest-neighbor search. ([arXiv][13])

---

## Concrete “default” retrieval pipeline (recommended baseline)

If you need a robust starting point that usually works:

1. **BM25 retrieve** top `K_lex` (e.g., 100–500)
2. **Dense retrieve (ANN)** top `K_vec` (e.g., 100–500)
3. **Fuse with RRF** into top `K_fused` (e.g., 200)
4. **Cross-encoder rerank** top `K_rerank` (e.g., 50–200) ([arXiv][9])
5. Return **top N passages** (e.g., 5–20)

**Why this baseline is sane:**

- BM25 catches exact mentions. ([staff.city.ac.uk][14])
- Dense catches paraphrases.
- RRF avoids painful score normalization. ([cormack.uwaterloo.ca][7])
- Cross-encoder re-ranking buys precision. ([arXiv][9])

---

## Retrieval knobs (what agents MUST tune, in order)

### Knob order (optimize in this order)

1. **Content & fields** (what text is searchable; field boosts; analyzers)
2. **Candidate pool sizes** (`K_lex`, `K_vec`, `K_fused`)
3. **Fusion method** (default RRF; adjust its `k` only after pool sizes)
4. **ANN recall/latency** (HNSW `efSearch`, etc.) ([arXiv][4])
5. **Re-ranker budget** (`K_rerank` and model choice) ([arXiv][9])

### Typical failure modes (and fixes)

- **Good answers exist but aren’t retrieved** → increase recall: bigger K, better analyzers, add BM25 if missing, add query expansion / HyDE. ([arXiv][13])
- **Retrieved set is noisy** → add/strengthen reranker; improve chunking boundaries; add metadata filters.
- **Hybrid results are unstable** → use rank-based fusion (RRF) instead of score mixing. ([cormack.uwaterloo.ca][7])
- **Vector retrieval misses exact entities** → ensure BM25 branch exists; ensure tokenization preserves identifiers.

---

## Evaluation: how agents should prove retrieval quality

### Offline evaluation (MUST)

You **MUST** maintain a small, versioned evaluation set:

- 50–200 representative queries
- for each, a small set of known-relevant passages (or doc IDs)
- segmented buckets (IDs-heavy queries vs conceptual queries, etc.)

Compute:

- **Recall@K** (most important for candidate generation)
- **nDCG@K / MRR@K** (more rank-sensitive; useful post-fusion/post-rerank)

If you lack labels, you **SHOULD**:

- bootstrap with human review on top-K outputs
- or use weak supervision (click logs, support resolutions)
- or use a benchmark harness mindset like BEIR to reason about generalization tradeoffs across retriever classes. ([arXiv][15])

BEIR explicitly compares lexical, dense, sparse, late-interaction, and reranking approaches in a zero-shot setup and is useful as a conceptual reference point. ([arXiv][15])

### Online evaluation (SHOULD)

You SHOULD monitor:

- retrieval latency p50/p95
- “answerable@K” proxy (did top-K include at least one passage judged relevant?)
- downstream grounding rates / citation rates (if your app exposes that)

---

## Minimal implementation checklist (agent SOP)

When an agent is asked “stand up retrieval for RAG”, it **MUST** do:

1. **Implement BM25 baseline** (Lucene/Elasticsearch/OpenSearch/etc.) ([Elastic][16])
2. **Implement vector retrieval** with ANN (HNSW or Faiss) ([arXiv][4])
3. **Implement RRF fusion** (rank-based; de-dup IDs) ([cormack.uwaterloo.ca][7])
4. **Add cross-encoder reranking** for top fused candidates ([arXiv][9])
5. **Create an evaluation set + dashboards** (Recall@K + latency)
6. **Only then** consider SPLADE or ColBERT if the baseline misses targets. ([arXiv][5])

---

[1]: https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/okapi_trec3.pdf?utm_source=chatgpt.com 'Okapi at TREC{3'
[2]: https://docs.opensearch.org/latest/vector-search/ai-search/hybrid-search/index/?utm_source=chatgpt.com 'Hybrid search'
[3]: https://www.elastic.co/blog/practical-bm25-part-2-the-bm25-algorithm-and-its-variables?utm_source=chatgpt.com 'Practical BM25 - Part 2: The BM25 Algorithm and its ...'
[4]: https://arxiv.org/abs/1603.09320?utm_source=chatgpt.com 'Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs'
[5]: https://arxiv.org/abs/2109.10086?utm_source=chatgpt.com 'SPLADE v2: Sparse Lexical and Expansion Model for Information Retrieval'
[6]: https://arxiv.org/abs/2004.12832?utm_source=chatgpt.com 'ColBERT: Efficient and Effective Passage Search via ...'
[7]: https://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf?utm_source=chatgpt.com 'Reciprocal Rank Fusion outperforms Condorcet and ...'
[8]: https://opensearch.org/blog/building-effective-hybrid-search-in-opensearch-techniques-and-best-practices/?utm_source=chatgpt.com 'Building effective hybrid search in OpenSearch'
[9]: https://arxiv.org/abs/1901.04085?utm_source=chatgpt.com 'Passage Re-ranking with BERT'
[10]: https://www.elastic.co/blog/practical-bm25-part-3-considerations-for-picking-b-and-k1-in-elasticsearch?utm_source=chatgpt.com 'Practical BM25 - Part 3: Considerations for Picking b and ...'
[11]: https://arxiv.org/pdf/2401.08281?utm_source=chatgpt.com 'The Faiss library'
[12]: https://aclanthology.org/2022.naacl-main.272/?utm_source=chatgpt.com 'Effective and Efficient Retrieval via Lightweight Late ...'
[13]: https://arxiv.org/abs/2212.10496?utm_source=chatgpt.com 'Precise Zero-Shot Dense Retrieval without Relevance Labels'
[14]: https://www.staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf?utm_source=chatgpt.com 'The Probabilistic Relevance Framework: BM25 and Beyond'
[15]: https://arxiv.org/abs/2104.08663?utm_source=chatgpt.com 'BEIR: A Heterogenous Benchmark for Zero-shot Evaluation of Information Retrieval Models'
[16]: https://www.elastic.co/guide/en/elasticsearch/reference/8.19/index-modules-similarity.html?utm_source=chatgpt.com 'Similarity module | Elasticsearch Guide [8.19]'
