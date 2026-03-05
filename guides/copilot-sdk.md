# Copilot SDK Agent Implementation Guide (Node.js)

## 0) Scope and non-negotiables

1. **All agents MUST run from code via the Copilot SDK.** Direct calls to the Copilot CLI (shelling out to `copilot`, using CLI prompt files, etc.) are forbidden in production paths. The SDK is the only integration surface your code may use. ([GitHub][1])
2. **All agent activity MUST be observable and auditable by default.** Every run MUST emit append-only audit records (prompts, model, tool calls, responses, errors, timing). The project chooses the storage backend; the logging contract is not optional.
3. **Model spend policy:** the runtime MUST NOT select any model with a **premium request multiplier ≥ 3** (example: 3× or 30×). ([GitHub Docs][2])
4. **Determinism:** agents MUST follow MUST/SHOULD requirements in this guide; ambiguity MUST be converted into explicit assumptions recorded in audit logs.

---

## 1) What the Copilot SDK actually is

- The Node.js Copilot SDK provides **programmatic control of the GitHub Copilot CLI via JSON-RPC**. It exposes a client (`CopilotClient`) and conversational sessions (`CopilotSession`) with event streams, tools, and persistence features. ([GitHub][1])
- The SDK is **in technical preview** and may change in breaking ways; your integration MUST version-pin and include compatibility checks. ([GitHub][1])

---

## 2) Reference architecture (recommended)

### 2.1 Components

1. **Agent Host (Node.js service)**
   - Owns the Copilot SDK client lifecycle (`start`, `stop`, `forceStop`). ([GitHub][1])
   - Exposes an internal API to start/stop/query agent runs.

2. **Run Registry (durable state store)**
   - Stores run state machine, session IDs, cancellation tokens, and pointers to audit logs.
   - Can be PostgreSQL, DynamoDB, etc. (project choice). The interface contract is fixed (see §8).

3. **Audit Log Sink (append-only)**
   - Writes **JSONL** (one event per line) or an equivalent append-only stream.
   - Storage backend is project-defined (S3, OpenSearch, Loki, CloudWatch, etc.).

4. **Worker Pool**
   - Pulls queued runs, creates sessions, executes prompts/tools, emits audit events.
   - MUST support concurrency limits per repo/tenant and per model.

---

## 3) Core SDK usage patterns you MUST implement

### 3.1 Client lifecycle

- The host MUST create exactly one long-lived `CopilotClient` instance per process (or per tenant if isolation required) and MUST call:
  - `await client.start()` on boot
  - `await client.stop()` on graceful shutdown; `forceStop()` only as emergency fallback ([GitHub][1])

### 3.2 Session lifecycle (your “agent run” execution unit)

Each run MUST map to one SDK session.

- Start: `client.createSession({ model, tools, systemMessage, infiniteSessions, hooks, ... })` ([GitHub][1])
- Execute:
  - Prefer `sendAndWait()` for bounded tasks.
  - Use event streaming (`assistant.message_delta`, etc.) only if you persist deltas (recommended for full audit). ([GitHub][1])

- Cancel:
  - MUST implement user-driven cancellation via `session.abort()` (soft cancel). ([GitHub][1])

- Finish:
  - MUST call `session.destroy()` to free resources (even on errors). ([GitHub][1])

### 3.3 Session discovery and resumption (operational robustness)

- The host MUST support:
  - `listSessions()` to recover from crashes and detect orphaned work. ([GitHub][1])
  - `resumeSession(sessionId)` for resumable workflows. ([GitHub][1])
  - `deleteSession(sessionId)` for explicit cleanup policies. ([GitHub][1])

### 3.4 Infinite sessions (context compaction)

- If you enable infinite sessions (default behavior per SDK docs), the host MUST:
  - record `session.workspacePath` (contains persisted artifacts)
  - log compaction events (`session.compaction_start`, `session.compaction_complete`) ([GitHub][1])

- If your runs must be strictly ephemeral, you SHOULD disable infinite sessions explicitly.

---

## 4) Mandatory observability + auditing design

### 4.1 What you MUST log (minimum contract)

Every run MUST produce append-only audit events for:

1. **run.created**: runId, requested agent type, requested model policy, caller identity/tenant
2. **session.created**: sdk sessionId, selected model identifier, reasoningEffort (if used), tools enabled ([GitHub][1])
3. **user.prompt**: full prompt text (or redacted if sensitive), attachments metadata ([GitHub][1])
4. **assistant.delta** (optional but recommended): every `assistant.message_delta` chunk
5. **assistant.message**: final assistant output content ([GitHub][1])
6. **tool.start / tool.complete**: tool name, args (redacted), duration, result hash; based on SDK events like `tool.execution_start` and `tool.execution_complete` ([GitHub][1])
7. **error**: stack, sdk error payload, classification (retryable/non-retryable)
8. **run.completed / run.canceled / run.failed**: terminal state, timings, output summary + hashes

> The SDK provides session event streams and lifecycle events; you MUST treat those events as your primary telemetry source. ([GitHub][1])

### 4.2 Audit format you SHOULD use (robust default)

- **JSON Lines (JSONL)** with one event per line.
- Each event SHOULD include:
  - `runId`, `sessionId`, `seq`, `ts`
  - `eventType`, `model`, `agentName`
  - `payload` (structured)
  - `prevHash`, `hash` (hash-chain for tamper evidence)

### 4.3 Redaction and secrets

- Audit logs MUST NOT store:
  - API keys, bearer tokens, private certificates, raw OAuth codes

- Audit logs SHOULD store:
  - stable identifiers (token fingerprint/hash) instead of raw values

- Tool arguments/results MUST be redacted by policy (per-tool schema-based redaction).

### 4.4 Metrics and tracing (operational observability)

- The host SHOULD emit:
  - run duration, tool duration histograms, cancellation rate, retry rate
  - model usage counts (by multiplier band: 0×/0.25×/0.33×/1×)

- The host SHOULD add distributed tracing (e.g., OpenTelemetry) with:
  - one trace per run
  - spans for: session creation, each tool call, streaming, compaction

---

## 5) Model catalog (current Copilot models) and cost multipliers

### 5.1 Supported models (as of GitHub Docs page)

Copilot currently lists these models (availability depends on plan/client): ([GitHub Docs][2])

- **OpenAI**: GPT-4.1, GPT-5 mini, GPT-5.1, GPT-5.1-Codex, GPT-5.1-Codex-Mini, GPT-5.1-Codex-Max, GPT-5.2, GPT-5.2-Codex, GPT-5.3-Codex ([GitHub Docs][2])
- **Anthropic**: Claude Haiku 4.5, Claude Sonnet 4, Claude Sonnet 4.5, Claude Sonnet 4.6, Claude Opus 4.5, Claude Opus 4.6, Claude Opus 4.6 (fast mode, preview) ([GitHub Docs][2])
- **Google**: Gemini 2.5 Pro, Gemini 3 Flash, Gemini 3 Pro, Gemini 3.1 Pro ([GitHub Docs][2])
- **xAI**: Grok Code Fast 1 ([GitHub Docs][2])
- **Fine-tuned / special**: Raptor mini, Goldeneye ([GitHub Docs][2])
- **Also listed in multipliers**: GPT-4o ([GitHub Docs][2])

### 5.2 Premium request multipliers (paid plans)

Your runtime MUST enforce the “no ≥3×” policy using this table: ([GitHub Docs][2])

Allowed (≤1×):

- **0×**: GPT-4.1, GPT-4o, GPT-5 mini, Raptor mini
- **0.25×**: Grok Code Fast 1
- **0.33×**: Claude Haiku 4.5, Gemini 3 Flash, GPT-5.1-Codex-Mini
- **1×**: Claude Sonnet 4 / 4.5 / 4.6, Gemini 2.5 Pro, Gemini 3 Pro, Gemini 3.1 Pro, GPT-5.1, GPT-5.1-Codex, GPT-5.1-Codex-Max, GPT-5.2, GPT-5.2-Codex, GPT-5.3-Codex

Forbidden (≥3×):

- **3×**: Claude Opus 4.5, Claude Opus 4.6
- **30×**: Claude Opus 4.6 (fast mode) (preview)

### 5.3 Model identifier hygiene (SDK)

- The SDK expects model identifiers like `"gpt-5"` or `"claude-sonnet-4.5"` in examples; identifiers are not guaranteed to match the marketing names exactly. You MUST discover the exact identifiers at runtime using `listModels()` (and persist the chosen identifier into audit logs). ([GitHub][1])

---

## 6) Model selection by task type (must satisfy cost policy)

This section defines **defaults**. You MAY override by project policy, but you MUST keep the “no ≥3×” rule.

### 6.1 Fast, cheap, high-volume tasks (classification, routing, extraction)

- Default MUST be a **0× or ≤0.33×** model:
  - GPT-5 mini (0×)
  - GPT-4.1 (0×)
  - GPT-4o (0×)
  - GPT-5.1-Codex-Mini (0.33×)
  - Gemini 3 Flash (0.33×)
  - Claude Haiku 4.5 (0.33×) ([GitHub Docs][2])

Use cases:

- intent detection, lightweight summarization, log parsing, prompt rewriting, triage, tagging

### 6.2 Deterministic code generation / refactors / patch creation

- Default MUST be a **1× code-capable model**:
  - GPT-5.2-Codex (1×) or GPT-5.1-Codex (1×) ([GitHub Docs][2])

- Alternative MUST be a **1× generalist** if coding model underperforms for the task:
  - Claude Sonnet 4.6 (1×) ([GitHub Docs][2])

Use cases:

- implementing features, multi-file refactors, writing tests, generating migrations

### 6.3 Architecture/planning/reasoning-heavy tasks (but cost-controlled)

- Default MUST be a **1×** model:
  - GPT-5.2 (1×) or Gemini 2.5 Pro (1×) or Claude Sonnet 4.6 (1×) ([GitHub Docs][2])

- If the SDK/model supports `reasoningEffort`, you SHOULD set it to `"medium"` by default and allow `"high"` only for explicitly flagged runs. ([GitHub][1])

Use cases:

- producing implementation plans, threat models, complex debugging strategies, design reviews

### 6.4 “Reviewer” tasks (code review, security review, diff critique)

- Default SHOULD be:
  - Claude Sonnet 4.6 (1×) or GPT-5.2 (1×) ([GitHub Docs][2])

- For “lint-level” checks, use GPT-5 mini (0×) first-pass, then escalate if needed.

### 6.5 Escalation rule (cost-aware)

- The runtime MUST start with the cheapest suitable tier and SHOULD escalate only if:
  - output failed schema validation,
  - test execution failed and the model could not correct it within N retries,
  - the run is explicitly marked “high criticality”.

---

## 7) Tools: how you MUST implement capabilities

### 7.1 Tool design constraints

- Tools MUST be:
  - deterministic (same input → same output, within reason)
  - side-effect controlled (explicit “write” tools)
  - schema-validated

- The SDK supports defining tools with Zod schemas via `defineTool`; you SHOULD use that pattern. ([GitHub][1])

### 7.2 Tool categories (recommended minimal set)

1. **read-only**
   - read files, search repo, query internal indexes, fetch docs

2. **write**
   - apply patch, create file, open PR draft (if your environment supports it)

3. **verify**
   - run tests, run linters, compile

4. **external**
   - call internal APIs with strict allowlists

### 7.3 Tool telemetry (mandatory)

- For every tool call you MUST log:
  - name, args hash, start/end timestamps, duration
  - result hash and a redacted preview
  - error payload (if failed)

---

## 8) Run management: start/stop/track running agents (robust standard)

### 8.1 Run state machine (MUST implement)

A run MUST be in exactly one state:

- `QUEUED` → `STARTING` → `RUNNING` → (`COMPLETED` | `FAILED` | `CANCELED`)

Transitions MUST be atomic in the Run Registry.

### 8.2 Run identity (MUST implement)

- `runId`: UUIDv7 (recommended)
- `sessionId`: Copilot SDK session ID persisted immediately after creation ([GitHub][1])
- `agentName`: stable string (e.g., `planner`, `coder`, `reviewer`)
- `modelId`: exact SDK model identifier used (not a marketing name)

### 8.3 Starting a run (MUST implement)

1. Create Run Registry record: `QUEUED`
2. Worker claims run with a lease (TTL + heartbeat)
3. Worker creates SDK session (`STARTING`)
4. Worker begins prompts/tools (`RUNNING`)
5. Worker writes terminal state and destroys session

### 8.4 Stopping/canceling a run (MUST implement)

- Cancel request MUST:
  1. mark run `CANCEL_REQUESTED` (or equivalent flag)
  2. call `session.abort()` if the run is `RUNNING` ([GitHub][1])
  3. ensure session is destroyed
  4. emit `run.canceled` audit event

### 8.5 Crash recovery (MUST implement)

On boot (or periodically), the host MUST:

- query Run Registry for leased-but-stale runs
- query SDK `listSessions()` for orphan sessions ([GitHub][1])
- decide:
  - resume (`resumeSession`) for resumable runs ([GitHub][1])
  - or cancel + destroy + delete session

---

## 9) Subagents

You have **two distinct subagent concepts**:

1. **Copilot Chat subagents** (IDE feature: `runSubagent` / `#runSubagent`)
2. **SDK-level subagents** (you emulate subagents by creating isolated SDK sessions)

You MUST treat them differently.

### 9.1 Copilot Chat subagents (IDE: `#runSubagent`)

If your organization uses Copilot Chat in IDEs, subagents work like this:

- Subagents run in an isolated context window and return only final results to the main chat. ([Visual Studio Code][3])
- Subagents use the **same tools and model** as the main session and **cannot create other subagents**. ([GitHub Docs][4])
- You MUST enable the `runSubagent` tool in the Copilot Chat tools picker; prompt files/custom agents MUST declare it in frontmatter tools. ([GitHub Docs][4])
- Invocation patterns you SHOULD use: ([GitHub Docs][4])
  - Direct: “Use the testing subagent to …”
  - Explicit tool call: “Evaluate … using **#runSubagent** …”

> Note: official docs use `#runSubagent` (not `#subAgent`). Your guidance and internal examples SHOULD standardize on `#runSubagent`. ([GitHub Docs][4])

### 9.2 SDK-level subagents (your production system)

Because you are forbidding CLI usage and building agents in Node.js, you MUST implement “subagents” as **child sessions**:

**Definition:** a subagent is a short-lived SDK session with:

- clean context window (no main session transcript),
- minimal tools,
- explicit output contract.

**Standard pattern (MUST implement):**

1. Main agent creates a `Subtask` object:
   - `subtaskId`, `purpose`, `inputs`, `expectedOutputSchema`, `toolAllowlist`, `modelTier`

2. Host spawns a new SDK session:
   - `createSession({ model, tools: toolAllowlist, systemMessage: subagentInstruction, ... })`

3. Subagent runs exactly one `sendAndWait()` prompt (or bounded sequence) and returns:
   - structured result + summary + evidence references

4. Host destroys the subagent session and attaches the subagent’s **final output only** to the parent run context.

**Concurrency:**

- The orchestrator SHOULD run independent subtasks in parallel (bounded by worker concurrency).
- The orchestrator MUST serialize subtasks with explicit dependencies.

**Audit requirements:**

- Subagent runs MUST emit audit logs exactly like parent runs, and MUST link via `parentRunId` + `subtaskId`.

### 9.3 Orchestrator agent (recommended)

Create a dedicated `orchestrator` agent type whose only job is:

- decompose tasks
- dispatch SDK-level subagents
- aggregate results into a final plan/patch/review

This keeps “thinking” separate from “doing” and reduces context bloat (mirrors IDE subagent rationale). ([Visual Studio Code][3])

---

## 10) Custom agents (profile-driven behavior) and how it maps to your SDK system

Copilot’s native “custom agents” are defined as `.agent.md` files with YAML frontmatter (name, description, tools, and optionally model in IDE contexts). ([GitHub Docs][5])

Your production system SHOULD mirror this with a code-first registry:

### 10.1 Agent spec (code)

Each agent type SHOULD have a spec:

- `name`, `description`
- `defaultModelTier` (fast/standard)
- `toolAllowlist`
- `systemMessageTemplate`
- `outputSchema`
- `retryPolicy`
- `subagentPolicy` (when to dispatch subagents)

### 10.2 Agent selection

- The orchestrator MUST select agents by capability, not by model name.
- The orchestrator MUST apply:
  - model spend policy (no ≥3×)
  - tool minimization
  - audit logging

---

## 11) Deterministic prompting rules (MUST enforce)

1. Prompts MUST include:
   - objective
   - constraints (including “no ≥3× multipliers”)
   - allowed tools
   - output format/schema
   - stop conditions (what “done” means)

2. Agents MUST NOT fabricate tool outputs. Tool evidence MUST be referenced by:
   - tool call id / audit event seq
   - file paths / diff hunks

3. If requirements are ambiguous, the agent MUST:
   - state assumptions
   - log them as `assumption.*` audit events
   - proceed with the simplest viable assumption

---

## 12) Minimal “golden path” implementation checklist

### 12.1 Bootstrap

- [ ] Pin `@github/copilot-sdk` version; record in build metadata. ([GitHub][1])
- [ ] Implement `CopilotClientManager` with `start/stop/forceStop`. ([GitHub][1])
- [ ] Implement `RunRegistry` + `AuditSink` interfaces.

### 12.2 Session execution

- [ ] Create session with:
  - `model` chosen by policy
  - `tools` allowlist
  - `systemMessage` (append mode unless explicitly replacing) ([GitHub][1])

- [ ] Subscribe to session events:
  - `assistant.message(_delta)`, `tool.execution_*`, `session.idle`, compaction events ([GitHub][1])

- [ ] Persist every event to audit sink with hash chain.

### 12.3 Operational controls

- [ ] `abort()` on cancel; `destroy()` always in `finally`. ([GitHub][1])
- [ ] List/resume/delete sessions for recovery workflows. ([GitHub][1])
- [ ] Run TTL + heartbeat + stuck-run sweeper.

### 12.4 Subagents

- [ ] SDK-level subagent runner that spawns child sessions, minimal tools, strict schema.
- [ ] Orchestrator that parallelizes independent subtasks.

---

## 13) Reference code skeleton (illustrative, adapt to your project)

```ts
import { CopilotClient, defineTool } from '@github/copilot-sdk';
import { z } from 'zod';

type RunId = string;

interface AuditSink {
  append(event: Record<string, unknown>): Promise<void>;
}

interface RunRegistry {
  createRun(input: { agentName: string; requestedBy: string }): Promise<{ runId: RunId }>;
  setState(runId: RunId, state: string, patch?: Record<string, unknown>): Promise<void>;
  get(runId: RunId): Promise<any>;
}

const MODEL_POLICY = {
  // MUST exclude multiplier >= 3 models at selection time (enforced elsewhere).
  defaultFast: 'gpt-5-mini',
  defaultCode: 'gpt-5.2-codex',
  defaultReasoning: 'gpt-5.2',
};

export class AgentHost {
  private client = new CopilotClient({ logLevel: 'info' });
  constructor(
    private runs: RunRegistry,
    private audit: AuditSink,
  ) {}

  async start() {
    await this.client.start();
  }
  async stop() {
    await this.client.stop();
  }

  async runCoder(runId: RunId, prompt: string) {
    await this.runs.setState(runId, 'STARTING');

    const tool = defineTool('read_repo_file', {
      description: 'Read a repository file by path',
      parameters: z.object({ path: z.string() }),
      handler: async ({ path }) => {
        // project-specific
        return { path, content: '...' };
      },
    });

    const session = await this.client.createSession({
      model: MODEL_POLICY.defaultCode,
      tools: [tool],
      systemMessage: { content: 'You MUST output a unified diff only.' },
    });

    const onAny = session.on(async (evt) => {
      await this.audit.append({ runId, sessionId: session.sessionId, ts: Date.now(), evt });
    });

    try {
      await this.runs.setState(runId, 'RUNNING', { sessionId: session.sessionId });
      await session.sendAndWait({ prompt }, 10 * 60 * 1000);
      await this.runs.setState(runId, 'COMPLETED');
    } catch (e: any) {
      await this.audit.append({
        runId,
        sessionId: session.sessionId,
        ts: Date.now(),
        error: String(e?.stack ?? e),
      });
      await this.runs.setState(runId, 'FAILED');
      throw e;
    } finally {
      onAny(); // unsubscribe
      await session.destroy();
    }
  }
}
```

This skeleton is intentionally incomplete; your production implementation MUST add:

- model discovery (`listModels`) + multiplier enforcement ([GitHub][1])
- structured audit event types + hash chain
- cancellation path (`abort`)
- run leasing + recovery (`listSessions`, `resumeSession`) ([GitHub][1])

---

## 14) Source-of-truth references you SHOULD track in your internal docs

- Supported Copilot models + multipliers (update this regularly). ([GitHub Docs][2])
- Copilot SDK Node.js README (API surface, events, infinite sessions, tools). ([GitHub][1])
- Subagents behavior and `#runSubagent` invocation (IDE). ([GitHub Docs][4])
- Custom agents profile format (`.agent.md`, YAML frontmatter). ([GitHub Docs][5])

[1]: https://raw.githubusercontent.com/github/copilot-sdk/main/nodejs/README.md 'raw.githubusercontent.com'
[2]: https://docs.github.com/copilot/reference/ai-models/supported-models 'Supported AI models in GitHub Copilot - GitHub Docs'
[3]: https://code.visualstudio.com/docs/copilot/agents/subagents 'Subagents in Visual Studio Code'
[4]: https://docs.github.com/copilot/using-github-copilot/asking-github-copilot-questions-in-your-ide 'Asking GitHub Copilot questions in your IDE - GitHub Docs'
[5]: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents 'Creating custom agents for Copilot coding agent - GitHub Docs'
