I’ll lay out an agent-ready chunking playbook for RAG: concrete techniques, the trade-offs they optimize for, and a practical decision tree you can apply per corpus/query type.

# Chunking for RAG — robust guide (agent-oriented)

## What chunking MUST achieve

A chunking strategy MUST optimize for these three outcomes (in this order):

1. **Retrievability**: the right evidence lands in the top-K results.
2. **Usability**: retrieved chunks contain enough local context to be understood.
3. **Stability**: chunk IDs and boundaries remain as stable as possible across re-indexing.

Chunking is not only “splitting text”; it is **defining the atomic retrieval unit** your retriever can return.

---

## Core constraints you MUST respect

- You MUST keep chunk sizes within the limits of your embedding/retrieval pipeline. For OpenAI’s retrieval configuration, `max_chunk_size_tokens` is constrained to **100–4096**, and overlap should not exceed **half** the chunk size. ([OpenAI Developers][1])
- You SHOULD measure chunk size in **tokens**, not characters, when the embedding model/token limits matter (almost always). ([OpenAI Developers][1])

---

## Decision tree (pick a chunking strategy)

### Step 0 — Identify document type and “semantic boundaries”

**If your docs have structure, follow structure first.** Only fall back to generic splitting when structure is absent.

**A. Highly structured docs** (Markdown with headings, HTML, PDFs with pages, legal docs with sections, code, tickets)

- Prefer **structure-aware chunking** (headings/sections/functions/pages).
- Add **boundary-preserving rules** (never split inside code blocks/tables; keep heading + following content together).

**B. Mostly unstructured prose** (wikis, articles, handbooks)

- Start with **recursive splitting** (paragraph → sentence → word) as baseline. LangChain explicitly recommends starting with `RecursiveCharacterTextSplitter` for most use cases. ([LangChain Docs][2])

---

### Step 1 — Classify query behavior (what users ask)

**1) Precise lookup queries** (IDs, error codes, API names)

- Use **smaller, boundary-aligned chunks** (keep the atomic fact tight).
- Consider **indexing multiple granularities** (see “multi-granularity” below).

**2) Explanations / “why/how” queries** (need surrounding rationale)

- Use **medium chunks** + **window metadata** or **overlap** (keep reasoning intact).
- Sentence-window approaches explicitly store surrounding context in metadata for each sentence-sized node. ([LlamaIndex][3])

**3) Cross-section synthesis** (policy + exceptions, long narratives)

- Prefer **hierarchical + multi-granularity** chunking (parent section + child chunks).
- Consider **context-preserving approaches** (semantic chunking, late chunking) if baseline recall is insufficient.

---

### Step 2 — Choose your “context preservation” mechanism

Pick exactly one primary mechanism (you can combine, but one should be the default).

#### Option A: Overlap (cheap, reliable baseline)

- Use overlap to mitigate boundary loss; this is a first-line tactic in common splitters. ([LangChain Docs][4])
- Overlap is most valuable when users ask about content that frequently straddles chunk boundaries (definitions + example, claim + citation).

#### Option B: Window metadata (better semantics, still cheap)

- Sentence-window node parsing: each sentence node stores a window of surrounding sentences in metadata. ([LlamaIndex][3])
- This is often superior to large overlap because the _retrieval unit stays small_ while the _LLM context becomes richer_.

#### Option C: Semantic chunking (adaptive boundaries)

- Semantic chunking chooses breakpoints based on embedding similarity between sentences, aiming to keep semantically related sentences together. ([LlamaIndex][5])
- Use when your docs have variable density (some sections are lists, others are deep prose) and fixed-size chunking fragments meaning.

#### Option D: Late chunking (maximize global context in embeddings)

- Late chunking embeds a long text first, then applies chunking after the transformer (before pooling), so chunk embeddings retain broader context. ([arXiv][6])
- Empirically, recent evaluation work compares late chunking vs contextual retrieval, noting trade-offs between coherence and compute. ([arXiv][7])

---

### Step 3 — Decide chunk granularity (single vs multi-granularity)

**If any of these are true, you SHOULD do multi-granularity indexing:**

- The same corpus supports both lookup _and_ explanatory questions.
- You have long sections where small chunks lose coherence, but large chunks add noise.
- You need high recall without exploding top-K.

**Multi-granularity pattern**

- Index **small child chunks** (high precision)
- Also index **parent chunks** (section-level, high coherence)
- Retrieve from both, then **deduplicate + rerank**.

This is a practical version of “hierarchical retrieval” without requiring a complex graph.

---

## Techniques catalogue (what to implement)

### 1) Recursive boundary splitting (baseline default)

**When**: generic prose, mixed formatting, you need a strong baseline fast.
**How**: attempt to split on strong separators first (e.g., paragraph breaks), then progressively weaker ones. This is the core idea of LangChain’s recursive splitter. ([LangChain][8])

**Agent rules**

- You MUST preserve paragraph boundaries when possible.
- You SHOULD keep headings with the content that follows.
- You SHOULD add modest overlap _or_ use window metadata.

---

### 2) Structure-aware splitting (preferred whenever structure exists)

**When**: Markdown/HTML/legal docs/code/PDFs with stable page/section cues.
**How**:

- Markdown: split by `# / ## / ###`, but keep subheading blocks intact.
- HTML: split by semantic tags (`h1/h2`, `article`, `section`).
- Code: split by AST nodes (function/class), not characters.
- PDFs: split by page _only if_ the PDF has consistent page-local meaning; otherwise extract text with headings if possible.

**Agent rules**

- You MUST not split inside tables/code blocks.
- You MUST attach structural metadata to each chunk: `{doc_id, heading_path, page, section_id}`.

---

### 3) Sentence window chunking (small units + surrounding context)

**When**: FAQs, policies, specs, where answers depend on nearby sentences.
**How**: store sentence-level chunks, and include N previous/next sentences as metadata “window”. LlamaIndex’s SentenceWindowNodeParser does exactly this pattern. ([LlamaIndex][3])

**Agent rules**

- Retrieval returns the sentence chunk.
- Generation uses the sentence chunk + its window metadata.

This often beats “huge chunks” because retrieval stays precise.

---

### 4) Semantic chunking (adaptive breakpointing)

**When**: fixed chunk sizes either fragment meaning or overstuff chunks.
**How**: compute embeddings for sentence units, then select breakpoints where similarity drops (or via percentile thresholds). LlamaIndex documents semantic chunking as embedding-similarity breakpointing. ([LlamaIndex][5])

**Agent rules**

- You MUST tune breakpoint parameters on a validation set (see evaluation section).
- You SHOULD keep maximum chunk token size caps even with semantic grouping.

---

### 5) Late chunking (context-rich embeddings for long docs)

**When**: long documents where local chunks are ambiguous without earlier context.
**How**: run a long-context embedding model over the full document, then pool embeddings into chunk vectors “late”. This is the core method described in the late chunking paper. ([arXiv][6])

**Agent rules**

- You MUST budget compute: late chunking can be heavier operationally.
- You SHOULD A/B test vs semantic chunking; published comparisons suggest meaningful trade-offs. ([arXiv][7])

---

## Stable chunk IDs (you MUST do this)

Chunk IDs MUST be stable across:

- re-ingestion
- minor edits outside the chunk
- changes in upstream parsing order

**Recommended ID scheme (robust)**

- `doc_uid`: stable document identifier (e.g., canonical URL, file hash of raw source)
- `anchor`: best available stable anchor in the source:
  - preferred: `{section_id, paragraph_id}` (structure-aware)
  - fallback: `{start_token_offset}` (tokenized text)

- `content_fingerprint`: hash of **normalized** chunk text (whitespace normalized, line endings normalized)

**Chunk ID**

- `chunk_id = hash(doc_uid + anchor + content_fingerprint_versioned)`

**Agent rules**

- You MUST version your normalization/fingerprinting algorithm (so you can intentionally migrate IDs).
- You MUST store `{prev_chunk_id, next_chunk_id}` links when sequential order matters (sentence windows, narratives). LlamaIndex explicitly supports prev/next relationships in node parsing. ([LlamaIndex][3])

---

## Chunk metadata (minimum required)

Every chunk you index MUST carry:

- `doc_uid`
- `source` (file path / URL / system)
- `heading_path` (if available)
- `position` (page number or section index)
- `created_at` + `ingestion_run_id`
- `chunking_strategy` + parameters (auditable)

This is non-negotiable for debugging retrieval failures.

---

## Parameter selection without guessing (evaluation-driven)

You SHOULD not argue about chunk sizes philosophically—measure.

A practical approach is:

1. Build a small gold set: 50–200 representative questions + expected source locations.
2. Evaluate retrieval metrics at top-K (e.g., Recall@10) and answer metrics (faithfulness/groundedness).
3. Sweep chunking parameters (size/overlap/window/semantic threshold).
4. Pick the Pareto frontier (quality vs latency/cost).

LlamaIndex explicitly discusses evaluating chunk size choices for RAG quality (faithfulness/relevancy). ([LlamaIndex][9])

---

## Operational checklist (agent-ready)

### Ingestion

- MUST detect doc type and select splitter accordingly.
- MUST record chunking configuration in metadata.
- SHOULD support multi-granularity for mixed query behavior.

### Retrieval

- MUST deduplicate overlapping hits (same doc/section).
- SHOULD rerank if you retrieve from multiple granularities.

### Debugging

- MUST log: query → retrieved chunk IDs → scores → final context.
- MUST support “why wasn’t this retrieved?” investigation via metadata.

---

## Common failure modes (and fixes)

- **Hanging definitions** (definition in one chunk, term usage in another)
  Fix: overlap or sentence windows. ([LangChain Docs][4])

- **Semantic drift in large chunks** (retrieved chunk contains right term but too much noise)
  Fix: smaller child chunks + parent fallback (multi-granularity).

- **Broken structure** (tables/code split mid-block)
  Fix: structure-aware rules; never split inside block constructs.

- **Ambiguous local chunks** (pronouns/“this/that” refer earlier)
  Fix: semantic chunking or late chunking. ([LlamaIndex][5])

---

## Minimal default strategy (if you need a safe starting point)

If you have no labels yet, start here:

- **Structure-aware splitting when possible**
- Otherwise **recursive splitting** as baseline (recommended starting point in LangChain docs) ([LangChain Docs][2])
- Add **either** modest overlap **or** sentence windows (prefer sentence windows if your framework supports it). ([LlamaIndex][3])
- Only move to **semantic** or **late chunking** after you’ve measured baseline gaps. ([LlamaIndex][5])

---

[1]: https://developers.openai.com/api/docs/guides/retrieval/?utm_source=chatgpt.com 'Retrieval | OpenAI API'
[2]: https://docs.langchain.com/oss/python/integrations/splitters?utm_source=chatgpt.com 'Text splitter integrations - Docs by LangChain'
[3]: https://developers.llamaindex.ai/python/framework-api-reference/node_parsers/semantic_splitter/?utm_source=chatgpt.com 'Semantic splitter'
[4]: https://docs.langchain.com/oss/python/integrations/splitters/recursive_text_splitter?utm_source=chatgpt.com 'Splitting recursively - Text splitter integration guide'
[5]: https://developers.llamaindex.ai/python/examples/node_parsers/semantic_chunking/?utm_source=chatgpt.com 'Semantic Chunker | LlamaIndex Python Documentation'
[6]: https://arxiv.org/pdf/2409.04701?utm_source=chatgpt.com 'Late Chunking'
[7]: https://arxiv.org/abs/2504.19754?utm_source=chatgpt.com 'Reconstructing Context: Evaluating Advanced Chunking Strategies for Retrieval-Augmented Generation'
[8]: https://lagnchain.readthedocs.io/en/stable/modules/indexes/text_splitters/examples/recursive_text_splitter.html?utm_source=chatgpt.com 'RecursiveCharacterTextSplitter — LangChain 0.0.149'
[9]: https://www.llamaindex.ai/blog/evaluating-the-ideal-chunk-size-for-a-rag-system-using-llamaindex-6207e5d3fec5?utm_source=chatgpt.com 'RAG Chunk Size Guide: Find The Best Setting'
