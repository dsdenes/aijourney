## Robust Svelte app guide for GenAI agents (Svelte 5 + SvelteKit)

### Baseline decisions

- You **MUST** build new Svelte apps with **SvelteKit** unless the requirement explicitly forbids SSR/routing/server features. Svelte’s own docs recommend SvelteKit as the default app framework. ([svelte.dev][1])
- You **MUST** assume **Svelte 5** for new work (it is stable) unless the repo is pinned to Svelte 4. ([svelte.dev][2])
- You **MUST** use **TypeScript** in application code (strict mode) unless explicitly forbidden.

---

## 1) Project creation and repo baseline

### Create the project

- You **MUST** create projects using the official CLI flow (`npx sv create ...`) unless an org standard mandates another scaffold. ([svelte.dev][1])
- You **SHOULD** select:
  - TypeScript
  - ESLint + Prettier
  - Playwright (for E2E) (if offered by the scaffold)

### Enforce quality gates

Your CI (and local `pre-push`) **MUST** run in this order:

1. `lint`
2. `typecheck`
3. `test:unit`
4. `test:integration`
5. `test:e2e`

Failures **MUST** block merge.

---

## 2) Canonical SvelteKit structure and module boundaries

### Required folder layout

- You **MUST** follow SvelteKit’s routing and project conventions:
  - `src/routes` defines URLs (file-based routing). ([svelte.dev][3])
  - Shared code lives under `src/lib` (importable via `$lib`). ([svelte.dev][4])
  - Server-only code lives under `src/lib/server` (SvelteKit prevents client imports). ([svelte.dev][4])
  - `tests/` exists as a first-class place for tests. ([svelte.dev][4])

Example skeleton (adapt, don’t invent extra top-level folders unless needed):

```text
src/
  routes/
    +layout.svelte
    +layout.ts
    +page.svelte
    api/
      health/
        +server.ts
  lib/
    components/
    features/
    styles/
    utils/
    stores/
    server/
      db/
      services/
  hooks.server.ts
static/
tests/
```

(Structure aligns with SvelteKit guidance. ([svelte.dev][4]))

### Hard boundary rules

- You **MUST NOT** import `$lib/server/**` or `$env/*/private` from any code that can run in the browser. ([svelte.dev][5])
- You **MUST** put secrets in `$env/static/private` or `$env/dynamic/private` and only read them in server-only modules and server route files. ([svelte.dev][6])
- Public env vars **MUST** be `PUBLIC_`-prefixed and imported via `$env/static/public` (or dynamic public) when you intentionally expose them to the client. ([svelte.dev][7])

---

## 3) Naming and code standards (deterministic conventions)

### Files and folders

- Svelte components **MUST** be `PascalCase.svelte` (e.g. `UserMenu.svelte`).
- Non-component TS modules **SHOULD** be `kebab-case.ts` or `camelCase.ts` (pick one and enforce via lint).
- Route folders/files **MUST** follow SvelteKit’s `+page`, `+layout`, `+server` naming. ([svelte.dev][8])

### Exports

- A `.svelte` component file **MUST** export exactly one component (default).
- Shared modules **MUST** have a single responsibility per file:
  - `formatters.ts`, `validators.ts`, `date.ts` etc.
  - Feature modules: `features/<feature>/api.ts`, `features/<feature>/model.ts`, `features/<feature>/ui/*.svelte`

### Types and validation

- All external inputs (URL params, form data, JSON bodies) **MUST** be validated at the boundary (server endpoints or form actions).
- Domain types **SHOULD** live in `src/lib/features/<feature>/types.ts` and be imported by both UI and server modules (no duplication).

---

## 4) Routing, data loading, and server interactions

### Load functions

- `load` functions **MUST** be pure with respect to server-side global state (no cross-request mutation).
- You **MUST** rely on SvelteKit’s dependency tracking for `load` reruns; do not manually refetch on every navigation unless required. ([svelte.dev][9])
- When you need explicit refresh, you **MUST** use invalidation (`invalidate(...)`) rather than ad-hoc event buses. ([svelte.dev][10])

### Server endpoints vs form actions

- You **SHOULD** prefer **form actions** for user-initiated mutations coming from forms (they support progressive enhancement). ([svelte.dev][11])
- You **MUST** keep sensitive mutation logic on the server in `+page.server.ts` actions or `+server.ts` endpoints.

Minimal form action pattern:

```ts
// src/routes/account/+page.server.ts
export const actions = {
  updateProfile: async ({ request, locals }) => {
    // validate inputs, perform mutation, return structured result
  },
};
```

(Concept: actions exported from `+page.server.*`. ([svelte.dev][11]))

### Hooks

- App-wide auth/session wiring **MUST** be implemented via SvelteKit hooks (`hooks.server.*`, optionally `hooks.client.*`). ([svelte.dev][12])
- Anything that touches cookies/headers/secrets **MUST** be server-hook code.

---

## 5) State management (the SvelteKit way)

SvelteKit is _full-stack_; state choices must account for SSR + hydration. Use this hierarchy:

### A) Prefer “state by construction”

- **URL state** (filters, pagination, selected IDs) **SHOULD** live in the URL or `page` state so it survives reloads and is shareable.
- **Server state** (data from DB/API) **MUST** come from `load` + invalidation, not from long-lived client stores.

SvelteKit provides explicit guidance and gotchas (e.g., avoiding shared server state; avoiding side-effects in `load`; URL state; snapshots). ([svelte.dev][13])

### B) Component-local state

- UI-only ephemeral state (open/closed, hover, local draft) **MUST** be component-local.
- In Svelte 5, you **SHOULD** use runes (`$state`, `$derived`) for component-local state and pure derivations. ([svelte.dev][14])

### C) Shared client state (stores)

Use stores when multiple components need the same client-side state _and_ it is not server state.

- You **MUST** use Svelte stores (or context-backed stores) for shared client state; do not invent custom event systems. ([svelte.dev][15])
- You **MUST** design stores as **APIs**, not raw writable globals:
  - expose `subscribe` + domain methods (`setUser`, `logout`, `addItem`) rather than exporting the bare `writable`.

- You **MUST NOT** store secrets or privileged data client-side.

Store access conventions:

- Components **MUST** read store values via `$store` subscription shorthand inside components. ([svelte.dev][15])

### D) Never share mutable state across server requests

- You **MUST NOT** keep request-derived mutable state in module scope on the server (cross-user leakage risk).
- Per-request state **MUST** be derived from `RequestEvent` (`locals`, `cookies`, `params`) inside server code and returned via `load`/actions.

This is a core SvelteKit state-management concern. ([svelte.dev][13])

---

## 6) Testing strategy (unit, integration, E2E)

Svelte is unopinionated; you can do unit/integration/E2E with tools like Vitest and Playwright. ([svelte.dev][16])
This guide standardizes on **Vitest** + **Playwright**.

### Test pyramid (MUST)

- You **MUST** implement:
  - Many **unit** tests (pure functions, validators, store logic)
  - Some **integration** tests (route-level data + actions + endpoints)
  - Fewer **E2E** tests (critical user journeys)

### 6.1 Unit tests (fast, deterministic)

- You **MUST** unit-test:
  - pure utility modules (`src/lib/utils/**`)
  - validators/parsers
  - store reducers / domain methods (without DOM)

- Unit tests **MUST NOT** require a browser.
- Unit tests **SHOULD** avoid time-based flakiness (fake timers if needed).

### 6.2 Component tests (UI behavior, still fast)

- You **SHOULD** component-test reusable UI components (`src/lib/components/**`) with Vitest’s component testing support. ([vitest.dev][17])
- You **SHOULD** prefer “real browser” component testing where feasible (it reduces jsdom mismatch), especially for components using modern browser APIs. ([sveltest.dev][18])
- Component tests **MUST** assert user-visible behavior:
  - text, roles, labels, enabled/disabled, emitted events
  - **NOT** internal implementation details

### 6.3 Integration tests (SvelteKit boundaries)

Integration tests validate the contract between:

- `load` + `+page.svelte`
- `actions` + form submissions
- `+server.ts` endpoints + fetch clients

Rules:

- Integration tests **MUST** exercise the boundary layer with realistic inputs (serialized form data, URL params).
- External calls **MUST** be mocked at the HTTP boundary (or with an injected client) so tests are deterministic.

### 6.4 E2E tests (Playwright)

Svelte’s docs explicitly show E2E testing with Playwright. ([svelte.dev][16])
Follow Playwright best practices:

- Tests **MUST** use resilient locators (role/label/text) and avoid brittle CSS selectors.
- Tests **MUST NOT** use arbitrary sleeps; rely on Playwright’s auto-waits.
- Tests **MUST** isolate state (fresh context/storage per test) and avoid ordering dependencies. ([Playwright][19])

Minimum E2E coverage **MUST** include:

- auth/login (if applicable)
- one read-only critical path
- one mutation path (create/update) validating persistence

---

## 7) State-management-specific test requirements

- Store tests **MUST** assert:
  - initial state
  - each domain method’s effect
  - derived values (pure)

- If using Svelte 5 runes for shared state across modules, you **MUST** document lifecycle/ownership and test that state resets between tests (avoid leakage). (Svelte 5 supports passing state across modules; treat it as a sharp tool.) ([svelte.dev][14])

---

## 8) Minimal CI/CD checklist (agent-executable)

Your pipeline **MUST** include:

- Install deps with lockfile respected (no floating installs).
- `lint` + `typecheck`
- `vitest` unit/component/integration
- `playwright install` + `playwright test` (E2E)
- Artifact upload: Playwright HTML report + screenshots/videos on failure

---

## 9) “Do / Don’t” summary for agents

### You MUST

- Use SvelteKit routing (`src/routes`) and `$lib` for shared modules. ([svelte.dev][3])
- Keep server-only code in `$lib/server` and enforce import boundaries. ([svelte.dev][20])
- Use `$env/static/private` for secrets and `$env/static/public` for intentionally exposed public values. ([svelte.dev][6])
- Prefer `load` + invalidation for server state; prefer form actions for form mutations. ([svelte.dev][9])
- Implement unit + integration + E2E tests (Vitest + Playwright). ([svelte.dev][16])

### You MUST NOT

- Share mutable module-scope state on the server (cross-request leakage). ([svelte.dev][13])
- Import server-only modules or private env vars into client-executed code. ([svelte.dev][5])
- Write E2E tests that depend on timing sleeps or test ordering. ([Playwright][19])

If you want, I can turn this into a repo-ready “Agent Rules” file (single page) plus a matching folder skeleton and npm scripts (`lint`, `typecheck`, `test:*`) aligned to the above.

[1]: https://svelte.dev/docs/svelte/getting-started?utm_source=chatgpt.com 'Getting started • Svelte Docs'
[2]: https://svelte.dev/blog/svelte-5-is-alive?utm_source=chatgpt.com 'Svelte 5 is alive'
[3]: https://svelte.dev/docs/kit/creating-a-project?utm_source=chatgpt.com 'Creating a project • SvelteKit Docs'
[4]: https://svelte.dev/docs/kit/project-structure?utm_source=chatgpt.com 'Project structure • SvelteKit Docs'
[5]: https://svelte.dev/docs/kit/server-only-modules?utm_source=chatgpt.com 'Server-only modules • SvelteKit Docs'
[6]: https://svelte.dev/docs/kit/%24env-static-private?utm_source=chatgpt.com '$env/static/private • SvelteKit Docs'
[7]: https://svelte.dev/docs/kit/%24env-static-public?utm_source=chatgpt.com '$env/static/public • SvelteKit Docs'
[8]: https://svelte.dev/docs/kit/routing?utm_source=chatgpt.com 'Routing • SvelteKit Docs'
[9]: https://svelte.dev/docs/kit/load?utm_source=chatgpt.com 'Loading data • SvelteKit Docs'
[10]: https://svelte.dev/tutorial/kit/invalidation?utm_source=chatgpt.com 'Advanced loading / Invalidation • Svelte Tutorial'
[11]: https://svelte.dev/docs/kit/form-actions?utm_source=chatgpt.com 'Form actions • SvelteKit Docs'
[12]: https://svelte.dev/docs/kit/hooks?utm_source=chatgpt.com 'Hooks • SvelteKit Docs'
[13]: https://svelte.dev/docs/kit/state-management?utm_source=chatgpt.com 'State management • SvelteKit Docs'
[14]: https://svelte.dev/docs/svelte/%24state?utm_source=chatgpt.com '$state • Svelte Docs'
[15]: https://svelte.dev/docs/svelte/stores?utm_source=chatgpt.com 'Stores • Svelte Docs'
[16]: https://svelte.dev/docs/svelte/testing?utm_source=chatgpt.com 'Testing • Svelte Docs'
[17]: https://vitest.dev/guide/browser/component-testing?utm_source=chatgpt.com 'Component Testing | Guide'
[18]: https://sveltest.dev/docs/getting-started?utm_source=chatgpt.com 'Getting Started - Setup, installation, first test'
[19]: https://playwright.dev/docs/best-practices?utm_source=chatgpt.com 'Best Practices'
[20]: https://svelte.dev/docs/kit/types?utm_source=chatgpt.com 'Types • SvelteKit Docs'
