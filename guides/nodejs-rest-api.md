## Node.js 24 + NestJS REST API Implementation Guide (for GenAI agents)

This guide is an **API-first, standards-driven** implementation playbook for **REST Maturity Level 2** APIs using **Node.js 24 (LTS)** + **NestJS** (TypeScript). REST standards MUST be based on the Zalando RESTful API Guidelines. ([opensource.zalando.com][1])

---

# 1) Non-negotiable principles (MUST)

### 1.1 API-first + OpenAPI contract

* You **MUST** design the API in **OpenAPI** *before* implementing it (“API-first”). ([opensource.zalando.com][1])
* You **MUST** maintain a **single self-contained OpenAPI YAML** (no fragile remote refs except explicitly allowed). ([opensource.zalando.com][1])
* You **MUST** **publish** the OpenAPI spec together with deployment artifacts (as part of the delivered service). ([opensource.zalando.com][1])
* You **SHOULD** use **OpenAPI 3.1** for new APIs. ([opensource.zalando.com][1])

### 1.2 REST Maturity Level 2 scope

You **MUST** implement:

* Resource-oriented URLs (nouns), not RPC endpoints.
* Standard HTTP methods (GET/POST/PUT/PATCH/DELETE).
* Standard HTTP status codes and semantics.
  (You do **NOT** need HATEOAS/hypermedia beyond pagination links; keep it L2.)

### 1.3 Deterministic consistency

* You **MUST** follow the Zalando naming rules for paths, query params, and JSON properties:

  * Path segments: **kebab-case**. ([opensource.zalando.com][1])
  * Query parameters: **snake_case**. ([opensource.zalando.com][1])
  * JSON property names: **snake_case**. ([opensource.zalando.com][1])

---

# 2) Reference architecture (NestJS) (MUST/SHOULD)

## 2.1 Layering rules

You **MUST** implement a thin-controller architecture:

* **Controller**: HTTP boundary only (routing, auth guards, DTO validation, mapping to service input).
* **Service**: business logic, orchestration, transactions, idempotency, authorization decisions (unless centralized).
* **Repository / Data access**: persistence-only; no HTTP concerns.
* **Clients (outbound integrations)**: HTTP/SDK adapters, retries/timeouts, circuit breaking where applicable.

You **MUST NOT**:

* Put persistence logic in controllers.
* Return ORM models directly to clients.
* Leak internal exceptions or stack traces to HTTP responses.

## 2.2 NestJS cross-cutting primitives

You **MUST** use NestJS mechanisms consistently:

* **Pipes** for validation + transformation.
* **Guards** for authentication/authorization.
* **Interceptors** for logging, timing, response shaping, correlation IDs, caching hints. ([docs.nestjs.com][2])
* **Exception filters** for consistent error mapping. (Nest ecosystem standard practice; keep it centralized.)

## 2.3 Configuration

* You **MUST** validate configuration on startup and fail fast on missing/invalid env vars. ([docs.nestjs.com][3])
* You **SHOULD** centralize config via `@nestjs/config`. ([docs.nestjs.com][3])

---

# 3) Repo layout including Vite (SHOULD)

Even if this is “just an API”, you asked for Vite—use it deterministically as an **API developer portal** + **contract test runner UI** (Swagger UI / Redoc, mock server UI, etc.).

**Recommended monorepo:**

```
/apps
  /api                 # NestJS service
  /docs                # Vite app (Swagger UI/Redoc, changelog, examples)
/packages
  /openapi             # openapi.yaml + shared schemas + examples
  /sdk                 # optional generated client SDKs
  /testkit             # shared test utilities (factories, helpers)
```

Rules:

* The OpenAPI file **MUST** live in `/packages/openapi/openapi.yaml`.
* The service **MUST** serve the published spec (e.g., `/openapi.yaml`) and the docs app **SHOULD** load it from the running service.

NestJS OpenAPI module guidance: NestJS docs. ([docs.nestjs.com][4])

---

# 4) HTTP and REST rules (MUST)

## 4.1 Methods and semantics

You **MUST** respect standard method semantics:

* GET/HEAD are **safe** and **idempotent**.
* PUT/DELETE are **idempotent**.
* POST/PATCH are not guaranteed idempotent. ([RFC Editor][5])

You **MUST NOT** rely on semantics that aren’t defined (e.g., meaningful GET request bodies). (Zalando explicitly supports “GET with body” patterns for searches in some cases, but default to standard GET query params unless your use case needs it.)

## 4.2 Status codes (baseline)

You **MUST** implement consistent status code usage (aligned with RFC semantics). ([RFC Editor][5])
Typical mapping:

* `200` OK: successful read/update with response body
* `201` Created: successful create with `Location` header
* `204` No Content: successful update/delete with no body
* `400` validation error (syntactic)
* `401` unauthenticated
* `403` unauthorized
* `404` not found (including “don’t leak existence” scenarios where appropriate)
* `409` conflict (business conflict)
* `412` precondition failed (ETag / If-Match failures) ([opensource.zalando.com][1])
* `422` semantic validation (optional; be consistent)
* `429` rate limit
* `5xx` server errors

## 4.3 URI design (L2)

You **MUST** use **kebab-case** for path segments. ([opensource.zalando.com][1])
You **SHOULD** use plural collection names:

* `/users`
* `/orders`
* `/shipment-orders/{shipment-order-id}` (example style in Zalando). ([opensource.zalando.com][1])

You **MUST** model sub-resources when they are owned:

* `/orders/{order_id}/items`
* `/users/{user_id}/sessions`

You **MUST NOT** invent verb-y endpoints like:

* `/users/{id}/activate` (prefer a state update via PATCH, or a dedicated “activation” resource if it’s a domain concept).

## 4.4 Naming rules (data + query)

You **MUST** use:

* `snake_case` JSON properties. ([opensource.zalando.com][1])
* `snake_case` query parameters. ([opensource.zalando.com][1])

Example:

```json
{
  "user_id": "u_123",
  "created_at": "2026-02-20T10:00:00Z"
}
```

---

# 5) Request/response standards (MUST)

## 5.1 Content types

* You **MUST** default to `application/json`.
* You **MUST** support structured error responses via `application/problem+json`. ([opensource.zalando.com][1])

## 5.2 Error model (Problem Details)

* Every endpoint **MUST** be capable of returning Problem Details on **4xx and 5xx** errors. ([opensource.zalando.com][1])
* Clients **SHOULD** send `Accept: application/problem+json` to receive details. ([opensource.zalando.com][1])

**Shape rule:** use RFC 9457 semantics and Zalando guidance. ([opensource.zalando.com][1])

Example (response body):

```json
{
  "type": "/problems/validation-error",
  "title": "Validation failed",
  "status": 400,
  "detail": "email must be a valid email address",
  "instance": "/users"
}
```

## 5.3 Pagination

* List endpoints **MUST** support pagination if they can exceed “a few hundred entries”. ([opensource.zalando.com][1])
* You **SHOULD** prefer **cursor-based** pagination over offset-based. ([opensource.zalando.com][1])
* You **SHOULD** use a consistent response page object (`items`, `next`, `prev`, etc.). ([opensource.zalando.com][1])

---

# 6) Concurrency, idempotency, caching (MUST/SHOULD)

## 6.1 Optimistic concurrency (SHOULD)

* You **SHOULD** support `ETag` with `If-Match` / `If-None-Match` for updates/creates where lost updates matter. ([opensource.zalando.com][1])
* On mismatch, you **MUST** return `412 Precondition Failed`. ([opensource.zalando.com][1])

## 6.2 Safe retries for POST/PATCH (SHOULD)

* You **MAY** support `Idempotency-Key` for POST/PATCH to make retries safe. ([opensource.zalando.com][1])
* If you implement it, you **MUST** store the key temporarily and return the original response for duplicates within TTL. ([opensource.zalando.com][1])

## 6.3 Correlation ID (MUST)

* You **MUST** support and propagate a request correlation header (`X-Flow-ID` in Zalando). ([opensource.zalando.com][1])
* If absent, the service **MUST** generate one and return/propagate it. ([opensource.zalando.com][1])

---

# 7) Security baseline (OWASP-driven) (MUST)

Use OWASP API Security Top 10 (2023) as your checklist. ([OWASP][6])

Minimum controls:

* **Authorization**

  * You **MUST** implement object-level authorization (BOLA) on every endpoint that accesses objects by ID. ([OWASP][6])
  * You **MUST** implement function-level authorization (role/permission) via guards/policies.
  * You **MUST** prevent property-level authorization failures (over-posting / mass assignment) by explicit DTO allowlists. ([OWASP][6])

* **Authentication**

  * You **MUST** use proven auth (JWT with proper validation, or session, or OAuth2/OIDC via gateway).
  * You **MUST** rate-limit login/token endpoints and protect against brute-force. ([OWASP][7])

* **Resource consumption**

  * You **MUST** implement rate limiting, request size limits, pagination defaults/caps, and timeouts to prevent “unrestricted resource consumption”. ([OWASP][6])

* **Input validation**

  * You **MUST** validate all inputs at the boundary (DTO validation pipe).
  * You **MUST** treat all strings as untrusted; prevent injection in DB queries and downstream calls.

* **Logging & monitoring**

  * You **MUST** log security-relevant events (auth failures, access denials, throttling) with `X-Flow-ID`.
  * You **SHOULD** add distributed tracing (see §8).

---

# 8) Observability (SHOULD)

* You **SHOULD** implement OpenTelemetry traces/metrics/log correlation for production debuggability. ([OpenTelemetry][8])
* You **MUST** include `X-Flow-ID` in logs and propagate it to outbound calls. ([opensource.zalando.com][1])

---

# 9) NestJS implementation standards (MUST)

## 9.1 Validation + transformation (global)

You **MUST** set a global validation pipe that:

* whitelists DTO properties (drop unknowns)
* forbids non-whitelisted when appropriate (hard fail)
* transforms types
* produces Problem Details on error

Example setup (conceptual):

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));
```

## 9.2 Centralized error mapping

You **MUST** implement an exception filter that:

* maps known application errors → deterministic HTTP status + RFC 9457 body
* masks unexpected errors → `500` with safe detail
* attaches `X-Flow-ID`
* never leaks stack traces

## 9.3 OpenAPI generation

You **MUST** keep the OpenAPI spec authoritative.
Two acceptable patterns:

1. **Hand-authored OpenAPI YAML** in `/packages/openapi`, plus server-side verification (recommended for strict API-first).
2. Generate OpenAPI from decorators (`@nestjs/swagger`) and treat output as build artifact (acceptable, but keep the YAML in VCS if you need deterministic review). ([docs.nestjs.com][4])

---

# 10) Testing strategy (MUST): unit, integration, contract

NestJS explicitly supports multi-layer testing; follow that structure. ([docs.nestjs.com][9])

## 10.1 Unit tests (MUST)

Scope:

* Services, domain logic, pure functions, mappers.
  Rules:
* No network.
* No real DB.
* Use deterministic fixtures/factories.
* Mock repositories/clients.

## 10.2 Integration tests (MUST)

Scope:

* Repository + real DB (containerized) OR in-memory equivalent that preserves semantics.
* Outbound HTTP clients via mock servers (wiremock-like) or contract stubs.
  Rules:
* Tests MUST assert schema compatibility for stored/returned shapes (DTO ↔ persistence mapping).

## 10.3 E2E/API tests (SHOULD)

Scope:

* Boot Nest app, hit HTTP endpoints via `supertest`, validate full routing + pipes + guards + filters.

## 10.4 Contract testing (MUST)

Your contract is OpenAPI.

You **MUST** automate “implementation matches OpenAPI” in CI using at least one of:

* **Dredd** (executes API description against a running service and validates responses structurally). ([dredd.org][10])
* **Schemathesis** (generates tests from OpenAPI; schema-aware, property-based; catches edge cases). ([schemathesis.io][11])

You **SHOULD** add **consumer-driven contract testing** (CDC) where you have multiple clients/teams:

* Pact-style CDC is appropriate when client expectations differ or multiple consumers exist (schema-based + examples also works). ([Pactflow Contract Testing Platform][12])

**Contract test gates MUST include:**

* request/response body schema validation
* required headers (e.g., `X-Flow-ID`)
* error responses: `application/problem+json` availability

---

# 11) CI quality gates (MUST)

A minimal deterministic pipeline MUST run:

1. **Static**: format + lint + TypeScript typecheck
2. **Unit**: `npm test` (fast)
3. **Integration**: DB containers + migrations + integration suite
4. **E2E**: run API tests against booted app
5. **Contract**: Dredd/Schemathesis against the running app + OpenAPI spec ([dredd.org][10])
6. **Security**: dependency scan + basic SAST (tool choice is up to you, but MUST exist)
7. **Artifact**: publish OpenAPI spec + docs build (Vite) as build outputs

---

# 12) Agent execution playbook (how an LLM agent MUST implement an endpoint)

When asked to add/modify any API behavior, the agent MUST do **exactly** this sequence:

1. **Update OpenAPI first**

   * Define/modify paths, operations, schemas, responses, error cases.
   * Enforce kebab-case paths + snake_case data. ([opensource.zalando.com][1])
   * Add pagination if endpoint returns lists. ([opensource.zalando.com][1])
   * Add Problem Details responses (`application/problem+json`). ([opensource.zalando.com][1])

2. **Add/adjust Nest module**

   * Create or update: `module`, `controller`, `service`, `repository/client`.
   * Controller MUST only parse/validate/map; service owns logic.

3. **DTOs**

   * DTOs MUST be explicit allowlists (no mass assignment).
   * DTO names MUST be deterministic: `CreateXRequestDto`, `UpdateXRequestDto`, `XResponseDto`, `XListResponseDto`.

4. **Validation**

   * Add validation decorators.
   * Ensure invalid input returns RFC 9457 Problem Details.

5. **Security**

   * Add guard/policy checks for object and function authorization (OWASP focus). ([OWASP][6])
   * Add rate limits where resource consumption risk exists. ([OWASP][6])

6. **Concurrency/idempotency**

   * If update endpoints risk lost updates, add ETag/If-Match flow. ([opensource.zalando.com][1])
   * If POST/PATCH must be safely retryable, implement Idempotency-Key handling. ([opensource.zalando.com][1])

7. **Observability**

   * Ensure `X-Flow-ID` is accepted, generated if missing, and propagated/logged. ([opensource.zalando.com][1])

8. **Tests (required order)**

   * Unit tests for service logic.
   * Integration tests for repository/DB semantics.
   * E2E tests for endpoint behavior.
   * Contract tests proving OpenAPI compliance (Dredd/Schemathesis). ([dredd.org][10])

9. **Definition of Done check**

   * All CI gates in §11 pass.
   * OpenAPI spec published and docs (Vite) updated.

---

# 13) Definition of Done checklist (copy/paste)

An endpoint/change is DONE only if all are true:

* [ ] OpenAPI 3.1 updated first; single YAML; published artifact. ([opensource.zalando.com][1])
* [ ] Paths kebab-case; query + JSON snake_case. ([opensource.zalando.com][1])
* [ ] Correct status codes per RFC semantics. ([RFC Editor][5])
* [ ] `application/problem+json` supported for 4xx/5xx. ([opensource.zalando.com][1])
* [ ] Pagination on list endpoints; cursor preferred. ([opensource.zalando.com][1])
* [ ] `X-Flow-ID` supported + propagated. ([opensource.zalando.com][1])
* [ ] OWASP API Top 10 concerns addressed (BOLA, auth, rate limiting, etc.). ([OWASP][6])
* [ ] Unit + integration + e2e + contract tests exist and pass. ([docs.nestjs.com][9])

---

[1]: https://opensource.zalando.com/restful-api-guidelines/ "Zalando RESTful API and Event Guidelines"
[2]: https://docs.nestjs.com/interceptors?utm_source=chatgpt.com "Interceptors | NestJS - A progressive Node.js framework"
[3]: https://docs.nestjs.com/techniques/configuration?utm_source=chatgpt.com "Configuration | NestJS - A progressive Node.js framework"
[4]: https://docs.nestjs.com/openapi/introduction?utm_source=chatgpt.com "OpenAPI (Swagger) | NestJS - A progressive Node.js ..."
[5]: https://www.rfc-editor.org/rfc/rfc9110.html?utm_source=chatgpt.com "RFC 9110: HTTP Semantics"
[6]: https://owasp.org/API-Security/editions/2023/en/0x11-t10/?utm_source=chatgpt.com "OWASP Top 10 API Security Risks – 2023"
[7]: https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/?utm_source=chatgpt.com "API2:2023 Broken Authentication"
[8]: https://opentelemetry.io/docs/platforms/kubernetes/operator/automatic/?utm_source=chatgpt.com "Injecting Auto-instrumentation"
[9]: https://docs.nestjs.com/fundamentals/testing?utm_source=chatgpt.com "Testing | NestJS - A progressive Node.js framework"
[10]: https://dredd.org/en/latest/how-it-works.html?utm_source=chatgpt.com "How It Works — Dredd latest documentation"
[11]: https://schemathesis.io/?utm_source=chatgpt.com "Schemathesis - Property-based API Testing for OpenAPI and ..."
[12]: https://pactflow.io/blog/contract-testing-using-json-schemas-and-open-api-part-2/?utm_source=chatgpt.com "Schema-based contract testing with JSON Schema ... - Pactflow"
