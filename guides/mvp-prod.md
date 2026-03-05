## MVP vs production-ready: an agent guide (default = MVP)

### Core definitions you MUST anchor on

- **MVP** MUST be treated as: the smallest product/version that enables **validated learning** with the **least effort**. (Build–Measure–Learn, minimum scope, fastest feedback.) ([Lean Startup Co.][1])
- **Production-ready** MUST be treated as: a system that can be **operated safely and reliably** under expected real-world conditions (security, reliability, operability, change control, recovery). ([sre.google][2])

Name-check sources (so you can align vocabulary with stakeholders): Eric Ries, The Lean Startup, Atlassian, Agile Alliance. ([Atlassian][3])

---

## 0) Stage rule and guardrails (what agents MUST assume)

- Agents MUST assume the app is **MVP-stage** unless the user explicitly says “production”, “GA”, “customer-facing”, “SLA/SLO”, “regulated”, or equivalent.
- Agents MUST optimize for **speed-to-learning**, not long-term operability.
- Agents MUST NOT implement “production-only” work unless a **trigger** applies (see Section 4).

---

## 1) The simplest correct mental model

### MVP is about **product risk**

MVP work MUST reduce one (or more) of:

- “Will users use it?”
- “Will users pay / adopt?”
- “Does the core workflow solve the core problem?”
- “Can we deliver the core outcome end-to-end?”

### Production-ready is about **operational risk**

Production-ready work MUST reduce one (or more) of:

- Outage/user-impact risk (reliability, resilience)
- Data loss risk (backups, recovery)
- Security/privacy risk (hardening, verification)
- Change risk (safe deploy/rollback)
- On-call/ops load (runbooks, alerting)

This split maps cleanly to classic SRE “production aspects” (architecture/dependencies, instrumentation/monitoring, emergency response, capacity, change management, performance). ([sre.google][2])

---

## 2) Work-item classifier (the rule engine agents SHOULD follow)

For every proposed task, agents SHOULD classify it into exactly one bucket:

### A. **MVP-essential (MUST do)**

Work that is required to:

- Deliver the **single most important user journey** end-to-end
- Collect **minimally credible feedback/metrics**
- Prevent **obvious catastrophic failure** (security/data loss) for the MVP’s scope

### B. **MVP-nice-to-have (SHOULD do only if cheap)**

Work that improves speed, clarity, or iteration cost, but is not required to learn.

### C. **Production-only (MUST NOT do in MVP by default)**

Work whose primary value is long-term reliability/scale/ops maturity, _not learning_.

### D. **Triggered production (MUST do when a trigger applies)**

Production work that becomes mandatory due to risk, exposure, or commitments (Section 4).

---

## 3) MVP checklist (what “done” means in MVP)

### 3.1 Product scope (MUST)

- You MUST define **one primary persona** and **one primary job-to-be-done**.
- You MUST define the **one critical path** (the “golden path”) and implement it end-to-end.
- You MUST define the **learning goal**: what decision will be made from MVP data?

### 3.2 Engineering scope (MUST)

- You MUST implement the smallest architecture that can support the golden path.
  - Prefer a **modular monolith** over microservices unless you have a hard integration constraint.

- You MUST keep dependencies minimal and reversible.

### 3.3 Data + correctness (MUST)

- You MUST define a minimal data model to support the golden path.
- You MUST enforce basic invariants at boundaries:
  - input validation
  - authZ checks (if any user separation exists)
  - idempotency where retries are expected (payments, webhooks, background jobs)

### 3.4 Quality (MUST)

- You MUST have **automated tests** that cover:
  - golden path happy-case
  - one representative failure case per boundary (bad input, unauthorized, missing dependency)

- You SHOULD prefer **integration tests** for MVP (fast confidence) over exhaustive unit coverage.

### 3.5 “MVP observability” (minimal, not extensive) (MUST)

MVP still needs _some_ signal, but not a full observability program.

- You MUST have:
  - structured logs (request id / correlation id)
  - error logging with stack traces
  - a minimal health endpoint (or equivalent)

- You SHOULD have:
  - one dashboard or query that answers: “is it working right now?”

- You MUST NOT build full SLOs, paging rotations, or broad alert suites in MVP by default. (Those are production.)

### 3.6 Deployment (MUST)

- You MUST have a repeatable build and deploy process (one-command or one pipeline).
- You MUST support **rollback** (even if crude: redeploy previous artifact).

---

## 4) Production triggers (when agents MUST “upgrade the bar”)

Agents MUST treat the app as **production-bound** (and implement “Triggered production” controls) if **any** of these are true:

### Exposure triggers

- Public internet, unknown users, or meaningful traffic
- Paying customers, contractual commitments, brand risk
- Handling sensitive data (PII), credentials, tokens, payment data
- Regulated environment (even partial)

### Reliability triggers

- You have uptime targets, SLAs/SLOs, or business-critical workflows
- A failure causes irrecoverable harm (data loss, financial loss)

### Operational triggers

- Multiple teams will operate it
- You expect frequent deploys by multiple engineers
- You need on-call handoff / runbooks

When triggers apply, agents MUST implement the minimum viable _production_ controls for that trigger (Section 5), not “everything”.

---

## 5) Production-ready checklist (what changes vs MVP)

A good production-ready baseline aligns with:

- SRE launch/readiness concerns (capacity, failover, monitoring, automation, dependencies) ([sre.google][4])
- Cloud Well-Architected pillars (ops excellence, security, reliability, performance efficiency, cost optimization; and sustainability on AWS). ([AWS Documentation][5])

Cloud context entities: Amazon Web Services, Microsoft Azure, Google Cloud.

### 5.1 Reliability & resilience (MUST in production)

- You MUST define expected load and failure modes.
- You MUST have:
  - capacity plan (even coarse)
  - timeouts/retries/circuit breaking where relevant
  - graceful degradation strategy for key dependencies
  - backup + restore plan (tested)

These map directly to the Google launch checklist themes: volume/capacity, reliability/failover, external dependencies, backup/restore. ([sre.google][4])

### 5.2 Observability & operations (MUST in production)

- You MUST have:
  - actionable alerting (not noisy)
  - dashboards for key user-impact metrics
  - runbooks for top failure modes
  - an owner/on-call policy (even if “business hours only”)
    Production readiness checklists consistently call out monitoring/observability and operational procedures as core gates. ([Cortex][6])

### 5.3 Security (MUST in production; partially MUST in MVP depending on data)

- You MUST:
  - do a security design review proportional to risk
  - run security scanning (deps, SAST as appropriate)
  - enforce least privilege, secret management, TLS, and authN/authZ hygiene

- You SHOULD benchmark against an application security verification baseline (e.g., OWASP ASVS) when exposure/PII exists. ([OWASP][7])
  Security org entity: OWASP.

### 5.4 Change management (MUST in production)

- You MUST have:
  - staged rollouts / canaries where risk is high
  - a verified rollback procedure
  - versioned configs and auditable deploys
    (These are explicit in the Google launch checklist: repeatable builds, canaries, staged rollouts, change control.) ([sre.google][4])

### 5.5 Governance & compliance (MUST when applicable)

- You MUST implement:
  - data retention/deletion policies where required
  - auditability where needed
  - access reviews for privileged paths

---

## 6) “Do NOT build this in MVP” list (unless triggered)

Agents MUST NOT spend MVP time on the following unless Section 4 triggers apply:

- Multi-region active/active, complex DR automation
- Full SLO program (error budgets, paging rotations, incident taxonomy)
- Comprehensive observability platform integration (deep tracing everywhere, broad alert matrices)
- Formal PRR-style documentation packs for every component
- Large-scale performance engineering (beyond “it works under light expected MVP load”)
- Enterprise IAM federation, complex RBAC matrices (beyond what the MVP user separation requires)
- Zero-trust networking, service meshes, policy-as-code frameworks (unless the environment mandates it)

Rationale: these are primarily **operational risk** reducers, not **validated learning** accelerators.

---

## 7) Minimal artifacts agents MUST produce

### MVP artifacts (MUST)

- README: how to run locally + deploy
- One-page “golden path” description (steps + expected outcomes)
- Minimal decision log: key tradeoffs and what you intentionally deferred

### Production artifacts (MUST when production/triggered)

- Runbook + on-call expectations
- Backup/restore procedure (tested)
- Threat model summary (proportional)
- Monitoring/alerting spec (what, why, thresholds)
- Dependency map + degradation plan

This aligns with the intent of SRE production readiness and launch coordination practices. ([sre.google][2])

---

## 8) Agent execution protocol (copy/paste into your agent system prompt)

Agents MUST:

1. Assume **MVP stage** unless explicitly told production.
2. Identify the **single golden path** and implement it end-to-end first.
3. Implement only the **minimum engineering** needed to learn (ship + measure + iterate).
4. Provide **minimal MVP observability** (structured logs + error capture), and defer extensive observability.
5. Use the **trigger rules** to decide when production controls become mandatory.
6. When production controls are required, implement the **smallest production-ready slice** that satisfies the trigger (not a full enterprise platform).

If you want, I can turn this into a deterministic scoring rubric (“MVP score” vs “Prod score”) that agents can compute per backlog item to prevent over-building.

[1]: https://leanstartup.co/resources/articles/what-is-an-mvp/?utm_source=chatgpt.com 'What Is an MVP? Eric Ries Explains'
[2]: https://sre.google/sre-book/evolving-sre-engagement-model/ 'Google SRE - Production Readiness Review: Engagement Insight'
[3]: https://www.atlassian.com/agile/product-management/minimum-viable-product?utm_source=chatgpt.com 'Minimum viable product (MVP): What is it & how to start'
[4]: https://sre.google/sre-book/launch-checklist/ 'Google SRE - Google checklist: SRE pre launch checklist'
[5]: https://docs.aws.amazon.com/wellarchitected/latest/framework/the-pillars-of-the-framework.html?utm_source=chatgpt.com 'The pillars of the framework - AWS Well-Architected ...'
[6]: https://www.cortex.io/post/how-to-create-a-great-production-readiness-checklist?utm_source=chatgpt.com 'Production Readiness Review Checklist & Best Practices'
[7]: https://owasp.org/www-project-application-security-verification-standard/?utm_source=chatgpt.com 'OWASP Application Security Verification Standard (ASVS)'
