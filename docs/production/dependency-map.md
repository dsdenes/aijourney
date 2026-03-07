# Dependency Map And Degradation Plan

## Dependency Map

### Web

- Depends on `api`
- Degradation if `api` is unavailable: frontend shell may load, but authenticated flows fail

### API

- Hard dependencies: MongoDB, Redis
- Functional dependency: KB Builder for knowledge-base features
- External dependencies: Google OAuth, OpenAI, Stripe, Scaleway object storage, Pinecone

### Worker

- Hard dependencies: Redis, OpenAI
- Functional dependency: API and KB Builder for some job types

### KB Builder

- Hard dependencies: MongoDB, OpenAI
- Functional dependencies: Pinecone, chunker binary

## Degradation Rules

### MongoDB unavailable

- API is not ready
- Roll back or restore database service immediately

### Redis unavailable

- API is not ready because queue-backed features and cache-backed flows degrade
- Worker throughput halts

### KB Builder unavailable

- API remains live but reports degraded readiness
- Knowledge-base chat, summarization, and ingestion workflows are impaired

### OpenAI unavailable

- Core AI features degrade
- Keep the platform available for non-LLM administrative paths where possible

### Stripe unavailable

- Billing operations degrade
- Do not block unrelated non-billing product flows

## Recovery Priority

1. MongoDB
2. Redis
3. API readiness
4. KB Builder and worker throughput
5. External provider restoration and backfill
