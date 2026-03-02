Below is a deterministic, implementation-ready guide you can hand to GenAI agents to design and ship a Rust “CPU worker” that offloads heavy computation from an I/O service safely and repeatably. It covers pattern selection, interface contracts, concurrency/backpressure, implementation standards, and testing (unit + integration + load).

---

## 1) Definition and success criteria

### 1.1 What “offload CPU-intensive tasks to a Rust worker” means

A “CPU worker” is a Rust component whose primary responsibility is **CPU-bound** computation (parsing, compression, ML inference, image/video transforms, optimization, cryptography, simulation, large-scale validation) executed **outside** the latency-sensitive I/O path of your host service.

### 1.2 Outcomes

A correct implementation MUST:

* Prevent CPU work from starving the host’s I/O/event loop threads.
* Enforce explicit concurrency limits and backpressure.
* Provide deterministic behavior where required (especially for tests and reproducibility).
* Be observable (metrics/logs/traces) and operable (timeouts, retries, cancellation).
* Be testable with unit tests + integration tests against real dependencies.

---

## 2) Pattern selection matrix (choose the integration form first)

Pick the simplest pattern that satisfies isolation, deployment, latency, and team constraints.

### 2.1 In-process native module (FFI / N-API / embedding)

**Use when**: ultra-low latency, shared memory is valuable, deployment can tolerate native binaries, and crash domain coupling is acceptable.
**Tradeoffs**: a Rust panic or UB in unsafe/FFI can crash the host process; ABI/toolchain friction.

Common examples:

* Node.js: N-API via napi-rs is widely used for native modules and reduces boilerplate by generating bindings/types. ([NAPI-RS][1])
* General caution: FFI boundary overhead and complexity vary by approach; N-API is typically preferred over raw FFI for Node. ([LogRocket Blog][2])

**MUST** use a stable interface (versioned) and defend the host from worker failures (timeouts, input validation, hard limits).

### 2.2 Out-of-process “sidecar” service (gRPC/HTTP)

**Use when**: you need fault isolation, independent scaling, language-agnostic integration, or stricter resource controls (CPU/mem).
**Tradeoffs**: network hop overhead; operational complexity.

**MUST** define a strict request/response contract and implement timeouts/deadlines. For long-lived flows, streaming RPCs SHOULD be used to reduce per-call overhead. ([gRPC][3])

### 2.3 Queue-based worker (async jobs)

**Use when**: tasks can be asynchronous, you want natural buffering, retries, and decoupled scaling. Often best for heavy jobs.
**Tradeoffs**: eventual consistency; idempotency complexity.

This pattern is common with managed queues in Amazon Web Services (e.g., SQS-style semantics), but applies to any broker.

### 2.4 CLI / batch worker (spawn process per job or per batch)

**Use when**: simplest isolation and deployment; tasks are coarse-grained; throughput is moderate.
**Tradeoffs**: startup overhead; limited interactive behavior.

### 2.5 WASM worker

**Use when**: sandboxing and portability are key, and performance is “good enough.”
**Tradeoffs**: limited system access; some workloads slower than native.

---

## 3) Interface contract (this is non-negotiable)

### 3.1 Job model

Every worker interaction MUST map to a *Job* with:

* `job_type` (stable string or enum)
* `job_version` (semantic version or integer)
* `job_id` (unique, idempotency key)
* `input` (structured, versioned)
* `limits` (time, memory, output size)
* `trace_context` (optional)
* `priority` (optional)

### 3.2 Versioning and compatibility

* The contract MUST be **versioned**.
* The worker MUST be able to reject unsupported versions deterministically (typed error code).
* Backward compatibility SHOULD be maintained for at least N prior minor versions (set N explicitly).

### 3.3 Determinism requirements (tests and reproducibility)

If determinism matters:

* The worker MUST accept an explicit `seed` for any randomized algorithm.
* Output ordering MUST be defined (e.g., sorted keys, stable iteration) to avoid nondeterministic maps/sets.
* Floating-point behavior SHOULD be constrained (document rounding/epsilon and avoid “compare floats directly” in tests).

---

## 4) Concurrency, backpressure, and starvation avoidance

### 4.1 Core rule

CPU-bound work MUST NOT run on the host’s async runtime worker threads.

If you use Tokio in Rust:

* CPU work MUST be moved off runtime threads using a dedicated mechanism.
* `spawn_blocking` MAY be used, but you MUST understand it can create many blocking threads and you SHOULD enforce a concurrency limit (e.g., semaphore). Tokio explicitly warns to limit CPU-bound parallelism and suggests specialized CPU executors like Rayon. ([Docs.rs][4])
* For heavy parallel CPU workloads, a Rayon thread pool SHOULD be used (fork-join style), rather than unlimited blocking threads. ([Stack Overflow][5])

### 4.2 Concurrency budgeting

Define these limits explicitly (no “auto” without rationale):

* `MAX_IN_FLIGHT_JOBS`
* `MAX_CPU_THREADS` (worker pool size)
* `MAX_JOB_BYTES_IN` / `MAX_JOB_BYTES_OUT`
* `MAX_JOB_DURATION_MS`

**MUST** implement backpressure:

* In-process: reject/queue when at capacity.
* Sidecar: return `RESOURCE_EXHAUSTED`-style error or shed load with explicit signal.
* Queue worker: control consumer concurrency and visibility timeouts.

---

## 5) Rust worker implementation standards

### 5.1 Crate structure

A robust layout SHOULD separate pure logic from transport:

* `worker-core/`
  Pure functions, algorithms, domain types, deterministic behavior, unit tests.
* `worker-protocol/`
  Versioned types (serde), error codes, schema evolution tests.
* `worker-service/`
  Transport (gRPC/HTTP/queue), auth, limits, tracing, integration tests.

### 5.2 Error model

The worker MUST expose errors as a stable, machine-parseable shape:

* `error_code` (stable enum/string)
* `error_message` (human-readable, non-sensitive)
* `retryable` (boolean)
* `details` (optional structured data)
* `caused_by` (optional internal cause; MUST NOT leak secrets across trust boundary)

**MUST NOT** rely on string matching of error messages for control flow.

### 5.3 Panics and crash safety

* The worker MUST treat panics as bugs and SHOULD fail the job safely (catching panics if boundary permits).
* Unsafe Rust SHOULD be avoided; if unavoidable, it MUST be isolated, reviewed, and fuzz-tested.

### 5.4 Serialization and copying

* Large payloads SHOULD use streaming or chunking (especially over gRPC).
* Avoid unnecessary copies; prefer borrowing/`bytes`-like buffers where possible.
* Define maximum payload sizes and enforce them at the boundary.

---

## 6) Transport-specific requirements

### 6.1 Sidecar gRPC/HTTP

* Every request MUST have a timeout/deadline; the worker MUST honor it and stop work if feasible.
* Long outputs SHOULD stream rather than buffer entire results in memory. gRPC streaming is a standard performance recommendation for long-lived logical flows. ([gRPC][3])
* Health endpoints MUST exist (liveness + readiness) with clear failure semantics.

### 6.2 Queue-based worker

* Jobs MUST be idempotent (same `job_id` ⇒ same side effect).
* Retries MUST be bounded and use a dead-letter mechanism (DLQ) with diagnostics.
* Visibility timeouts MUST exceed worst-case runtime or be extended via heartbeats.
* The worker MUST emit an explicit terminal status: `SUCCEEDED | FAILED_RETRYABLE | FAILED_TERMINAL`.

### 6.3 In-process (native module)

* Boundary functions MUST validate inputs and enforce limits before invoking heavy work.
* The module MUST provide a non-blocking host API (async wrapper) and enforce concurrency caps.

---

## 7) Observability and operations

The worker MUST:

* Emit structured logs with `job_id`, `job_type`, `job_version`, and duration.
* Emit metrics: queue depth (if applicable), in-flight jobs, CPU time, error counts by code, p95/p99 durations.
* Propagate trace context end-to-end (host → worker).
* Provide debug “job replay” capability in non-prod (store sanitized inputs when permitted).

---

## 8) Testing strategy (unit + integration + load)

### 8.1 Unit tests (Rust)

Unit tests MUST:

* Cover `worker-core` pure logic with deterministic fixtures.
* Include edge cases: empty input, max sizes, invalid versions, cancellation/timeouts.
* Verify error codes and retryability flags (not just message text).

Unit tests SHOULD:

* Include property-based tests for parsers and transformations.
* Include snapshot (“golden”) tests for stable outputs where appropriate.

### 8.2 Integration tests (real dependencies)

Integration tests MUST:

* Exercise the transport boundary (gRPC/HTTP/queue) end-to-end.
* Use real dependencies when correctness depends on them (DB, Redis, brokers).

Using Docker-backed Testcontainers is a standard way to run disposable real dependencies in tests; dynamic ports and no hardcoded hostnames/ports are recommended. ([Docker][6])
Rust’s Testcontainers ecosystem also supports Docker Compose with best practices like unique project names to avoid parallel test conflicts. ([rust.testcontainers.org][7])

### 8.3 Contract tests (host ↔ worker)

You MUST have automated contract tests that:

* Validate schema compatibility for each `job_version`.
* Ensure old clients can talk to new workers (within your defined compatibility window).
* Fail fast on breaking changes.

### 8.4 Load / performance tests

You SHOULD maintain repeatable benchmarks:

* Microbenchmarks for core algorithms.
* Load tests for the service/queue worker to find throughput limits and p95/p99 latency.
* Capacity tests that validate concurrency caps and backpressure behavior.

---

## 9) Naming and standards (deterministic conventions)

### 9.1 Job naming

* `job_type` MUST be lowercase kebab-case: `image-resize`, `pdf-parse`, `fare-rule-eval`
* `job_version` MUST be SemVer (recommended) or monotonic integer (documented).

### 9.2 Error codes

* MUST be stable, uppercase snake-case: `INVALID_INPUT`, `UNSUPPORTED_VERSION`, `TIMEOUT`, `RESOURCE_EXHAUSTED`, `INTERNAL`
* Retry policy MUST be derivable from the code (either by a `retryable` flag or a deterministic mapping table).

### 9.3 Metrics

* MUST be namespaced: `worker_jobs_in_flight`, `worker_job_duration_ms`, `worker_errors_total{code=...}`

### 9.4 Repos and crates

* Crate names SHOULD be `worker_core`, `worker_protocol`, `worker_service` (or `<domain>_core`, etc.)
* Public APIs MUST have rustdoc comments for contract behavior, limits, and error codes.

---

## 10) Minimal checklists (agents MUST follow)

### 10.1 “MUST” checklist

* MUST pick one integration pattern and justify it against latency/isolation/deployment.
* MUST define a versioned job contract with explicit limits.
* MUST implement concurrency caps + backpressure.
* MUST ensure CPU work does not starve async runtime threads (use proper thread pools). ([Docs.rs][4])
* MUST have stable error codes with retry semantics.
* MUST provide unit tests + integration tests + contract tests.
* MUST add observability (logs + metrics; traces if distributed).

### 10.2 “SHOULD” checklist

* SHOULD use a dedicated CPU executor (e.g., Rayon) for heavy parallel compute. ([Stack Overflow][5])
* SHOULD stream large inputs/outputs over RPC. ([gRPC][3])
* SHOULD use Testcontainers for real-dependency integration tests with dynamic ports. ([Docker][6])
* SHOULD benchmark core algorithms and track regressions in CI.

### 10.3 Anti-patterns (MUST NOT)

* MUST NOT run CPU-heavy loops on the async runtime worker threads.
* MUST NOT allow unbounded parallelism (threads, jobs, memory).
* MUST NOT depend on string matching of error messages.
* MUST NOT ship without a compatibility and versioning story.

---

## 11) Recommended “default architecture” (safe baseline)

If you don’t have strong constraints, the safest default is:

* **Queue-based worker** for heavy jobs (best isolation + retries),
* plus an optional **sidecar gRPC** for low-latency synchronous cases,
* with the core computation in `worker-core` reused by both.

---

[1]: https://napi.rs/blog/function-and-callbacks?utm_source=chatgpt.com "Functions and Callbacks in NAPI-RS"
[2]: https://blog.logrocket.com/improving-node-js-performing-rust/?utm_source=chatgpt.com "Improving Node.js performance using Rust"
[3]: https://grpc.io/docs/guides/performance/?utm_source=chatgpt.com "Performance Best Practices"
[4]: https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html?utm_source=chatgpt.com "spawn_blocking in tokio::task - Rust"
[5]: https://stackoverflow.com/questions/74547541/when-should-you-use-tokios-spawn-blocking?utm_source=chatgpt.com "When should you use Tokio's `spawn_blocking`?"
[6]: https://www.docker.com/blog/testcontainers-best-practices/?utm_source=chatgpt.com "Testcontainers Best Practices"
[7]: https://rust.testcontainers.org/features/docker_compose/?utm_source=chatgpt.com "Docker Compose Support"
