## RAG tech stack decision tree (for GenAI agents)

This guide is *only* about choosing the RAG stack (components + products + where they live), not about prompt design or chunking details.

---

### 0) Inputs you MUST collect (or assume explicitly)

Your stack choice is primarily determined by these constraints:

1. **Data governance**

* MUST know: can data leave your VPC / country / tenant boundary?
* MUST know: do you need per-tenant encryption keys, audit trails, retention, deletion SLAs?

2. **Scale**

* #documents, #chunks, average chunk size, and **update frequency** (batch vs continuous).
* Target QPS (steady + peak) and latency budget (p50/p95).

3. **Query requirements**

* Do you need **hybrid retrieval** (keywords + semantics) for SKUs/IDs/error codes + natural language?
* Do you need strict structured filters (tenant_id, ACLs, time windows), and are those filters selective?

4. **Existing infra**

* Do you already run **Postgres**, **Elasticsearch/OpenSearch**, or a managed vector DB?
* Do you have an ML platform team (model serving), or only app engineers?

5. **Ops tolerance**

* “One more cluster” acceptable? Or MUST stay inside existing DB/search?

---

## 1) Top-level decision: *Where does retrieval live?*

### Decision tree (pick the first match)

**A. “We MUST minimize new systems” → Use an existing platform**

1. If you already have **Postgres** and your RAG scale is modest → **Postgres + pgvector**. ([GitHub][1])
2. If you already have **Elasticsearch/OpenSearch** and you need both full-text + vectors in one place → **Elastic/OpenSearch vector search**. ([Elastic][2])

**B. “Retrieval quality/throughput matters; we can run a dedicated service” → Use a vector DB**

1. If you want **dense + sparse/hybrid in one system** with modern primitives → **Weaviate** or **Qdrant**. ([docs.weaviate.io][3])
2. If you want very large-scale ANN indexing options and distributed architecture → **Milvus**. ([Milvus][4])

**C. “We want a managed vector service” → Use hosted vector DB**

* If you accept a managed vendor and want mature hybrid patterns + research-backed fusion options → **Pinecone**. ([Pinecone Docs][5])

---

## 2) Retrieval strategy decision: dense vs lexical vs hybrid

### Rules of thumb (use MUST/SHOULD)

* You SHOULD default to **hybrid retrieval** unless you have strong evidence dense-only works for your corpus.

  * Hybrid combines vector search + keyword/BM25-family search and fuses results (often RRF). ([docs.weaviate.io][3])
* You MUST include **lexical** signals when your users search for:

  * IDs, SKUs, error codes, API names, version strings, proper nouns (dense embeddings often miss exact-token constraints).
* You SHOULD add a **reranker** (cross-encoder) if answer quality is a top KPI and you can afford extra latency/cost. Haystack’s hybrid tutorial shows this pattern explicitly (retrieve → join → cross-encoder rank). ([Haystack][6])

### How this affects product choice

* **Weaviate**: explicitly supports hybrid (vector + BM25F) with configurable fusion/weights. ([docs.weaviate.io][3])
* **Qdrant**: supports dense + sparse vectors and server-side IDF/BM25-related support (enabling hybrid styles). ([Qdrant][7])
* **Pinecone**: hybrid commonly implies **two indexes** (dense + sparse) and extra linkage/ops overhead. ([Pinecone Docs][5])

---

## 3) Vector store selection: the practical matrix

### Option 1 — Postgres + pgvector (best when “good enough” + minimal infra)

Choose this when:

* You MUST keep infra simple (already run Postgres).
* Scale is “small-to-medium” and latency isn’t ultra-tight.
* You need transactional metadata + vectors in one DB.

Key engineering implications:

* You MUST choose an ANN index strategy (HNSW/IVFFlat; some platforms also mention DiskANN). ([GitHub][1])
* You MUST be careful with **filters** (naive post-filtering can reduce returned rows vs requested k). ([Supabase][8])

### Option 2 — Elasticsearch/OpenSearch (best when you already run search and need hybrid)

Choose this when:

* You already operate Elastic/OpenSearch for logs/search.
* You need first-class full-text relevance plus vector kNN in the same system.

Key engineering implications:

* You MUST plan memory/page-cache behavior for HNSW-style approximate kNN (Elastic explicitly calls out resource requirements). ([Elastic][2])
* OpenSearch k-NN has multiple engines (faiss/nmslib/Lucene) and filtering approaches that affect correctness/recall under restrictive filters. ([docs.opensearch.org][9])

### Option 3 — Weaviate / Qdrant (best “default” dedicated retrieval service for hybrid RAG)

Choose this when:

* You want hybrid out-of-the-box and a retrieval-focused operational model.
* You want to iterate on fusion/weights quickly (without rebuilding your whole search stack).

Evidence/features:

* Weaviate hybrid explicitly fuses vector + BM25F. ([docs.weaviate.io][3])
* Qdrant supports sparse retrieval mechanics and hybrid demos with fusion algorithms (including RRF). ([Qdrant][7])

### Option 4 — Milvus (best for very large-scale / distributed vector retrieval)

Choose this when:

* You need large-scale indexing options and are willing to run a dedicated vector platform.
* Memory efficiency matters (quantization/IVF variants can reduce memory). ([Milvus][4])

### Option 5 — Pinecone (best when you want managed + hybrid research maturity)

Choose this when:

* You want managed ops and are okay with vendor usage.
* You want hybrid fusion choices grounded in published analysis.

Notes:

* Pinecone documents hybrid as dense + sparse (and calls out complexity of managing two indexes). ([Pinecone Docs][5])
* Pinecone also publishes analysis of fusion functions (including RRF). ([Pinecone][10])

---

## 4) Index & performance decision node (ANN strategy)

Your store choice forces index trade-offs:

* **HNSW**: typically strong recall/latency but more memory pressure (notably called out by Elastic for efficient performance). ([Elastic][2])
* **IVF / IVFFlat / IVF_PQ**: usually lower memory, tunable recall via probes/lists; often better for very large corpora if you accept tuning complexity. ([GitHub][1])
* **DiskANN**: some managed Postgres offerings highlight it as a balance between build speed and accuracy. ([docs.opensearch.org][11])

**Agent rule:**

* If you cannot guarantee enough RAM/page-cache for your full vector working set, you MUST not assume HNSW will meet p95 latency.

---

## 5) Orchestration layer decision (framework vs bespoke)

This is about *how you wire ingestion → retrieval → rerank → answer*, not where vectors live.

### If you want composable primitives (retrievers/rankers/pipelines)

* **LangChain**: strong abstractions around retrievers/vectorstores; useful if you already build app logic around it. ([LangChain Reference Docs][12])
* **LlamaIndex**: strong ingestion pipeline concept with transformation caching (material for repeated indexing runs). ([LlamaIndex][13])
* **Haystack**: explicit pipeline graph + retriever/ranker components and hybrid pipeline examples. ([docs.haystack.deepset.ai][14])

**Agent rule:**

* If your main risk is “indexing and document lifecycle is hard”, you SHOULD bias toward **LlamaIndex ingestion pipelines** (document management + caching). ([LlamaIndex][13])
* If your main risk is “we need clear pipeline graphs and swappable retrievers/rankers”, you SHOULD bias toward **Haystack**. ([docs.haystack.deepset.ai][14])

---

## 6) Embeddings & reranking decisions (stack implications)

### Embeddings (dense)

* If you use OpenAI embeddings, the docs specify typical embedding dimensions (and that dimensions can be reduced). ([OpenAI Developers][15])
* Your vector DB must support your embedding dimensionality and throughput.

### Reranking (cross-encoder)

* If quality is critical, you SHOULD include a cross-encoder reranker stage; Haystack’s hybrid tutorial demonstrates using a Transformers similarity ranker (cross-encoder) after hybrid retrieval. ([Haystack][6])

---

## 7) Minimal “stack blueprints” (outputs of the decision tree)

### Blueprint 1 — “MVP + minimal infra”

* Storage: Postgres + pgvector ([GitHub][1])
* Retrieval: start dense-only; add hybrid later if needed
* Orchestration: minimal bespoke or LangChain/LlamaIndex

Use when: low QPS, low corpus churn, strong constraint on new infra.

### Blueprint 2 — “Hybrid-first internal knowledge base”

* Storage: Weaviate or Qdrant (hybrid native) ([docs.weaviate.io][3])
* Retrieval: hybrid + RRF (or weighted fusion)
* Rerank: cross-encoder for top-K

Use when: lots of exact terms + semantic queries, and quality matters.

### Blueprint 3 — “Enterprise search stack reuse”

* Storage: Elasticsearch/OpenSearch (existing) ([Elastic][2])
* Retrieval: keyword + vector kNN; pay attention to memory + filtering semantics ([Elastic][2])
* Orchestration: Haystack/LangChain to standardize components

Use when: search team exists and operating one platform is a priority.

---

## 8) Evaluation tooling is part of the stack (don’t skip this decision)

If you can’t measure retrieval quality, you’ll churn on infra blindly.

* You SHOULD adopt an evaluation framework like **Ragas** for systematic metrics rather than ad-hoc checks. ([docs.ragas.io][16])

**Agent rule:**

* If you cannot commit to an eval loop, you MUST choose the simplest stack (usually Postgres+pgvector or existing search) to minimize moving parts until you can measure value.

---

### Quick “agent checklist” (fill and decide)

1. Data must stay: **yes/no** → if yes: self-host or VPC-managed only
2. Existing infra: **Postgres / Elastic / none**
3. Need hybrid: **yes/no** (IDs/code-heavy queries → yes)
4. Scale: **<1M / 1–50M / 50M+ chunks**
5. Filters: **light / heavy + highly selective**
6. Ops tolerance: **low / medium / high**

Then apply Section 1 tree and pick the blueprint closest to your constraints.

[1]: https://github.com/pgvector/pgvector?utm_source=chatgpt.com "pgvector/pgvector: Open-source vector similarity search for ..."
[2]: https://www.elastic.co/docs/solutions/search/vector/knn?utm_source=chatgpt.com "kNN search in Elasticsearch"
[3]: https://docs.weaviate.io/weaviate/search/hybrid?utm_source=chatgpt.com "Hybrid search | Weaviate Documentation"
[4]: https://milvus.io/docs/ivf-pq.md?utm_source=chatgpt.com "IVF_PQ | Milvus Documentation"
[5]: https://docs.pinecone.io/guides/search/hybrid-search?utm_source=chatgpt.com "Hybrid search - Pinecone Docs"
[6]: https://haystack.deepset.ai/tutorials/33_hybrid_retrieval?utm_source=chatgpt.com "Tutorial: Creating a Hybrid Retrieval Pipeline"
[7]: https://qdrant.tech/course/essentials/day-3/sparse-retrieval-demo/?utm_source=chatgpt.com "Demo: Keyword Search with Sparse Vectors"
[8]: https://supabase.com/docs/guides/database/extensions/pgvector?utm_source=chatgpt.com "pgvector: Embeddings and vector similarity"
[9]: https://docs.opensearch.org/1.3/search-plugins/knn/knn-index/?utm_source=chatgpt.com "k-NN Index"
[10]: https://www.pinecone.io/research/an-analysis-of-fusion-functions-for-hybrid-retrieval/?utm_source=chatgpt.com "An Analysis of Fusion Functions for Hybrid Retrieval"
[11]: https://docs.opensearch.org/latest/migration-assistant/migration-phases/migrate-metadata/transform-dense-vector-knn-vector/?utm_source=chatgpt.com "Transform dense_vector fields to knn_vector"
[12]: https://reference.langchain.com/v0.3/python/community/retrievers.html?utm_source=chatgpt.com "retrievers — 🦜🔗 LangChain documentation"
[13]: https://developers.llamaindex.ai/python/framework/module_guides/loading/ingestion_pipeline/?utm_source=chatgpt.com "Ingestion Pipeline | LlamaIndex Python Documentation"
[14]: https://docs.haystack.deepset.ai/docs/pipelines?utm_source=chatgpt.com "Pipelines | Haystack Documentation"
[15]: https://developers.openai.com/api/docs/guides/embeddings/?utm_source=chatgpt.com "Vector embeddings | OpenAI API"
[16]: https://docs.ragas.io/en/stable/?utm_source=chatgpt.com "Ragas"
