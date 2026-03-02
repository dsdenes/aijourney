Below is a deterministic, agent-oriented operating guide for the **GitLab CLI (`glab`)** (the official GitLab CLI). It assumes an agent is operating on a local workstation repo *or* inside GitLab CI. ([GitLab Docs][1])

---

## 0) Non-negotiable principles

1. **Safety-first**: An agent MUST prefer read-only discovery commands before any state-changing command (create/update/merge/tag/release).
2. **Determinism**: An agent MUST use non-interactive flags and machine-readable outputs where available (notably `glab api --output json|ndjson`).
3. **Least privilege & token hygiene**: An agent MUST minimize token blast radius (least scopes + least role + shortest lifetime practical) and MUST NOT leak tokens into logs, shell history, or repos. ([GitLab Docs][2])
4. **Correct target**: An agent MUST prove it is operating on the intended **host + namespace/project + branch** before it makes changes.

---

## 1) Capability model (what `glab` can do)

Agents SHOULD treat `glab` as the GitLab control-plane companion to `git`:

* Issues + merge requests
* CI/CD pipeline/job view/run/retry/trace
* Releases + changelog generation
* Multi-instance auth and host auto-detection from git remotes ([GitLab Docs][1])

---

## 2) Environment preflight (MUST run before doing anything destructive)

### 2.1 Confirm you are in the intended git repository

Agent MUST:

* `git rev-parse --show-toplevel`
* `git remote -v`
* `git status --porcelain`

Agent MUST stop if:

* Not a git repo
* `origin` points to an unexpected host/namespace
* Working tree is dirty when the task expects clean operations (merges/releases)

### 2.2 Confirm `glab` is installed and usable

Agent MUST:

* `glab --version`
* `glab --help`

### 2.3 Confirm `glab` context: host + auth state

Agent MUST:

* `glab auth status` (in-repo auto-detects instance from `git remote` / env / config) ([GitLab Docs][3])

If multiple GitLab instances are configured, the agent SHOULD check all:

* `glab auth status --all` ([GitLab Docs][3])

---

## 3) Authentication & token standards (local + CI)

### 3.1 Token type selection (MUST follow this order)

For automation, agents SHOULD prefer non-personal tokens:

1. **Project access token / Group access token** for automation identities (preferred).
2. **Personal access token (PAT)** only when the above is unavailable. ([GitLab Docs][2])

### 3.2 Token lifetime & rotation

Agent MUST:

* Use expiring tokens and rotate before expiry. ([GitLab Docs][2])
* Treat any token exposure as compromise: revoke and replace immediately.

### 3.3 Minimum scopes for `glab` login (important)

`glab auth login` documents minimum required scopes as:

* `api`, `write_repository` ([GitLab Docs][4])

Because these are broad, the agent MUST mitigate blast radius via:

* Dedicated automation identity with minimal GitLab **role** (project-level where possible)
* Separate tokens per purpose (read-only vs write paths) where feasible ([GitLab Docs][2])

### 3.4 Non-interactive login (local machine)

Agent MUST avoid placing tokens on command lines (history/process list risk).
Preferred patterns:

* Pipe token via stdin:

  * `printf '%s' "$GITLAB_TOKEN" | glab auth login --stdin --hostname <host>` ([GitLab Docs][4])

Agent SHOULD understand where `glab` stores config/creds:

* Default global config path: `~/.config/glab-cli/config.yml` ([GitLab Docs][4])

### 3.5 Environment variable precedence hazards

Agent MUST explicitly guard against “wrong token/host” problems:

* `GITLAB_TOKEN` can override what you think you logged in with (real-world gotcha). ([about.gitlab.com][5])
* In GitLab CI, `CI_JOB_TOKEN` is ephemeral and only valid during the job. ([GitLab Docs][6])
* In CI contexts, `glab` may auto-detect CI variables and ignore other variables (host/token). ([about.gitlab.com][7])

**Rule:** Before any write action, agent MUST print (redacting secrets) the effective:

* Host
* Project (namespace/path or ID)
* Auth identity (as far as `glab auth status` exposes it)
* Current branch / MR IID

---

## 4) Configuration standards (`glab config`)

Agents MUST manage configuration explicitly, never by “editing files blindly”.

### 4.1 Read config deterministically

* `glab config get <key>` (checks env → local → global by default) ([GitLab Docs][8])
* If you need to force global:

  * `glab config get -g <key>` ([GitLab Docs][8])

### 4.2 Set config deterministically

* `glab config set <key> <value>`
* To force global config file:

  * `glab config set -g <key> <value>` ([GitLab Docs][9])
* For per-host settings, agent SHOULD use `--host <hostname>` ([GitLab Docs][9])

### 4.3 Edit config only when unavoidable

* `glab config edit` uses editor precedence (`glab_editor` → `VISUAL` → `EDITOR`) ([GitLab Docs][10])
  Agents SHOULD avoid interactive editing unless the task explicitly requires it.

---

## 5) Repository targeting & navigation (MUST be explicit when not in repo)

### 5.1 Clone

* `glab repo clone <namespace/project>` (respects configured SSH/HTTPS; can pass git flags after `--`) ([GitLab Docs][11])

### 5.2 View project

* `glab repo view [repository]` (readme/description or open in browser) ([GitLab Docs][12])

### 5.3 Listing/searching projects

* `glab repo list` / `glab repo search <query>` ([GitLab Docs][13])

### 5.4 Repo override rule

When *not* operating in a checked-out repo, agent MUST provide `-R <GROUP/NAMESPACE/REPO>` on commands that support it (issues, MRs, CI, etc.). ([GitLab Docs][14])

---

## 6) Issues operating procedures

### 6.1 Discovery (read-only)

* `glab issue list` ([GitLab Docs][14])
* Filtered listing examples exist (assignee, milestone, opened). ([GitLab Docs][15])
* `glab issue view <id>` (supports URL input; can open in web) ([GitLab Docs][16])

### 6.2 Create/update/comment

* `glab issue create ...` (assignee, confidential, description, due date, epic, etc.) ([GitLab Docs][17])
* Add a note/comment:

  * `glab issue note -m "<message>" <issue-number>` ([GitLab Docs][14])

**Agent standards**

* Agent MUST link work to the right issue (include issue number in branch name and MR description).
* Agent SHOULD avoid confidential issues unless the task explicitly requires it.

---

## 7) Merge request operating procedures

### 7.1 Preconditions (MUST)

Before creating or modifying an MR, agent MUST:

* Confirm current branch and upstream tracking:

  * `git branch -vv`
* Ensure local branch is pushed (or plan to push) to the intended remote.

### 7.2 Create MR (deterministic flags)

* `glab mr create` supports:

  * source branch selection ([GitLab Docs][18])
  * reviewers ([GitLab Docs][18])
  * remove source branch toggle (true/false/omit for project default) ([GitLab Docs][18])
* `glab mr` examples include `--fill` and labels. ([GitLab Docs][19])

**Agent MUST** include in MR description:

* What changed (functional summary)
* Risk & rollback notes
* How to test
* Linked issues

### 7.3 Update MR state

* `glab mr update ...` can mark ready (`--ready`) and manage reviewers. ([GitLab Docs][20])

### 7.4 Approvals

* `glab mr approve ...` supports `--sha` to ensure approving the current HEAD state. ([GitLab Docs][21])

Agents MUST respect project approval rules:

* If approvals are required, agent MUST NOT attempt to merge until satisfied. ([GitLab Docs][22])

### 7.5 Merge

* `glab mr merge {<id>|<branch>}` merges/accepts an MR. ([GitLab Docs][23])

**Merge gate (MUST)**
Agent MUST verify:

* Required approvals satisfied (per project rules) ([GitLab Docs][22])
* Pipelines are green or policy-compliant (see CI section)

---

## 8) CI/CD procedures (pipelines and jobs)

### 8.1 View pipeline/jobs

* `glab ci view` can view/run/trace/log/cancel jobs in the current pipeline. ([GitLab Docs][24])

### 8.2 Run a pipeline

* `glab ci run` creates/runs a pipeline; supports `--branch`. ([GitLab Docs][25])

### 8.3 Retry or trace jobs

* `glab ci retry [job-id|job-name]` ([GitLab Docs][26])
* `glab ci trace [job-id|job-name]` ([GitLab Docs][27])

### 8.4 When `glab` lacks a capability: use `glab api`

Agents SHOULD use the API escape hatch for advanced querying:

* `glab api <endpoint>` supports:

  * `--paginate` to fetch all pages
  * `--output json|ndjson` for machine parsing ([GitLab Docs][28])

Example patterns (agent SHOULD adapt to your project IDs/names):

* List pipelines via GitLab API endpoint semantics: ([GitLab Docs][29])

  * `glab api --paginate "projects/<id>/pipelines" --output ndjson`

---

## 9) Releases & changelogs

### 9.1 Create/update a release

* `glab release create <tag>` creates (or updates) a release; requires at least Developer role; tags should be pushed first for annotated-tag flow. ([GitLab Docs][30])

**Agent MUST**

* Ensure tag points to the intended commit SHA
* Ensure release notes are deterministic and traceable (links to MRs/issues)

### 9.2 Generate changelog

* `glab changelog generate` supports config file path and ranges. ([GitLab Docs][31])

---

## 10) Logging, redaction, and auditability

1. Agent MUST redact:

   * Tokens (`GITLAB_TOKEN`, PATs, group/project tokens)
   * Any Authorization headers (including in `glab api` output)
2. Agent SHOULD prefer storing operational artifacts as links (MR URL, pipeline URL) rather than raw dumps.
3. Agent MUST preserve GitLab auditability:

   * Use merge requests rather than pushing to protected branches directly (unless the process explicitly allows it).

---

## 11) Standard “playbooks” (end-to-end sequences)

### Playbook A — Implement change → open MR → verify CI

1. Preflight (repo/remote/auth status)
2. `git checkout -b <branch>`
3. Make change; `git status --porcelain`
4. `git commit ...`
5. `git push -u origin <branch>`
6. `glab mr create --fill ...` ([GitLab Docs][19])
7. `glab ci view` (watch jobs) ([GitLab Docs][24])

### Playbook B — Triage issue → create fix branch → link MR

1. `glab issue view <id>` ([GitLab Docs][16])
2. Create branch referencing issue id
3. Open MR referencing issue in description
4. Comment back to issue with MR reference:

   * `glab issue note -m "Fix in !<mr_iid>" <id>` ([GitLab Docs][14])

### Playbook C — Investigate pipelines at scale (API)

1. Identify project ID
2. `glab api --paginate "projects/<id>/pipelines" --output ndjson` ([GitLab Docs][28])
3. Filter locally (agent-side) with deterministic rules

---

## 12) Hard failure rules (agent MUST stop)

Agent MUST stop and request human intervention if any of these are true:

* Auth ambiguity (multiple hosts/tokens; `auth status` inconsistent) ([GitLab Docs][3])
* Protected branch policy prevents intended action (don’t try to bypass)
* Required approvals are not satisfied but merge is requested ([GitLab Docs][22])
* CI policy is unknown but release/merge is requested
* Token appears revoked/invalid (rotate/re-auth, then re-run preflight) ([GitLab Docs][32])

---

[1]: https://docs.gitlab.com/cli/?utm_source=chatgpt.com "GitLab CLI (glab)"
[2]: https://docs.gitlab.com/auth/auth_practices/?utm_source=chatgpt.com "Authentication and authorization best practices"
[3]: https://docs.gitlab.com/cli/auth/status/?utm_source=chatgpt.com "glab auth status"
[4]: https://docs.gitlab.com/cli/auth/login/?utm_source=chatgpt.com "glab auth login"
[5]: https://gitlab.com/gitlab-org/cli/-/issues/6285?utm_source=chatgpt.com "Environment variable GITLAB_TOKEN takes precedence ..."
[6]: https://docs.gitlab.com/ci/jobs/ci_job_token/?utm_source=chatgpt.com "GitLab CI/CD job token"
[7]: https://gitlab.com/gitlab-org/cli/-/tree/main/docs/source?utm_source=chatgpt.com "docs/source · main · GitLab.org / cli"
[8]: https://docs.gitlab.com/cli/config/get/?utm_source=chatgpt.com "glab config get"
[9]: https://docs.gitlab.com/cli/config/set/?utm_source=chatgpt.com "glab config set"
[10]: https://docs.gitlab.com/cli/config/edit/?utm_source=chatgpt.com "glab config edit"
[11]: https://docs.gitlab.com/cli/repo/clone/?utm_source=chatgpt.com "glab repo clone"
[12]: https://docs.gitlab.com/cli/repo/view/?utm_source=chatgpt.com "glab repo view"
[13]: https://docs.gitlab.com/cli/repo/list/?utm_source=chatgpt.com "glab repo list"
[14]: https://docs.gitlab.com/cli/issue/?utm_source=chatgpt.com "glab issue"
[15]: https://docs.gitlab.com/cli/issue/list/?utm_source=chatgpt.com "glab issue list"
[16]: https://docs.gitlab.com/cli/issue/view/?utm_source=chatgpt.com "glab issue view"
[17]: https://docs.gitlab.com/cli/issue/create/?utm_source=chatgpt.com "glab issue create"
[18]: https://docs.gitlab.com/cli/mr/create/?utm_source=chatgpt.com "glab mr create"
[19]: https://docs.gitlab.com/cli/mr/?utm_source=chatgpt.com "glab mr"
[20]: https://docs.gitlab.com/cli/mr/update/?utm_source=chatgpt.com "glab mr update"
[21]: https://docs.gitlab.com/cli/mr/approve/?utm_source=chatgpt.com "glab mr approve"
[22]: https://docs.gitlab.com/user/project/merge_requests/approvals/?utm_source=chatgpt.com "Merge request approvals"
[23]: https://docs.gitlab.com/cli/mr/merge/?utm_source=chatgpt.com "glab mr merge"
[24]: https://docs.gitlab.com/cli/ci/view/?utm_source=chatgpt.com "glab ci view"
[25]: https://docs.gitlab.com/cli/ci/run/?utm_source=chatgpt.com "glab ci run"
[26]: https://docs.gitlab.com/cli/ci/retry/?utm_source=chatgpt.com "glab ci retry"
[27]: https://docs.gitlab.com/cli/ci/trace/?utm_source=chatgpt.com "glab ci trace"
[28]: https://docs.gitlab.com/cli/api/?utm_source=chatgpt.com "glab api"
[29]: https://docs.gitlab.com/api/pipelines/?utm_source=chatgpt.com "Pipelines API"
[30]: https://docs.gitlab.com/cli/release/create/?utm_source=chatgpt.com "glab release create"
[31]: https://docs.gitlab.com/cli/changelog/generate/?utm_source=chatgpt.com "glab changelog generate"
[32]: https://docs.gitlab.com/user/profile/personal_access_tokens/?utm_source=chatgpt.com "Personal access tokens"
