# GenAI Agent Guide: Working with the Local AWS CLI (`aws`)

## 1) Non-negotiable operating rules for agents

1. **You MUST be explicit about identity and scope before doing anything.**
   - You MUST run (or instruct the user to run) `aws sts get-caller-identity` **with the intended profile + region** before any mutating action.
   - You MUST log the resolved identity (Account, Arn) alongside every action.

2. **You MUST default to read-only behavior.**
   - You MUST NOT create/update/delete resources unless the user’s instruction explicitly authorizes it.
   - You SHOULD implement a “plan → apply” workflow: first list/describe current state, then propose exact commands, then apply.

3. **You MUST make region and profile selection deterministic.**
   - You MUST pass `--profile <name>` and `--region <region>` for all commands unless the user explicitly requires default behavior.
   - You MUST NOT rely on whatever happens to be in environment variables.

4. **You MUST produce machine-consumable outputs.**
   - You MUST use `--output json` for automation and parsing.
   - You SHOULD use `--query` (JMESPath) to reduce payloads before post-processing.

5. **You MUST disable interactive pagers in automation.**
   - You MUST add `--no-cli-pager` to commands in scripts/agents, or set `AWS_PAGER=""`. ([AWS Documentation][1])

---

## 2) AWS CLI mental model: configuration, credentials, and precedence

### 2.1 Configuration/credential sources and precedence

The AWS CLI resolves settings in this order:

1. **Command-line options**
2. **Environment variables**
3. **Config files** ([awscli.amazonaws.com][2])

Credential sources commonly used:

- Env vars (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`)
- Shared credentials file (`~/.aws/credentials`)
- Config file (`~/.aws/config`) ([awscli.amazonaws.com][2])

Key gotcha:

- If both files contain creds for the same profile, **the credentials file wins**. ([AWS Documentation][3])

### 2.2 Where profiles are stored

Default locations:

- **Shared credentials file**: `~/.aws/credentials` (override with `AWS_SHARED_CREDENTIALS_FILE`) ([awscli.amazonaws.com][2])
- **Config file**: `~/.aws/config` (override with `AWS_CONFIG_FILE`) ([AWS Documentation][4])

File format differences:

- In `~/.aws/config`, profiles are `[profile name]`
- In `~/.aws/credentials`, profiles are `[name]` (no `profile` prefix) ([awscli.amazonaws.com][2])

### 2.3 Shared files are also “SDK-compatible”

The shared `config` and `credentials` files are the standard way to configure AWS tools/SDKs (not just the CLI). ([AWS Documentation][5])

---

## 3) Credential strategy (what agents MUST prefer)

### 3.1 Preferred (humans): IAM Identity Center (SSO)

- You SHOULD prefer **IAM Identity Center** (SSO) for human users over long-lived access keys. ([AWS Documentation][6])
- You MUST configure via `aws configure sso` (or `aws configure sso-session` depending on your setup).
- You MUST obtain a token via `aws sso login --profile <profile>` before running commands. ([AWS Documentation][7])

**SSO pattern (agent-safe):**

```bash
aws configure sso --profile acme-dev
aws sso login --profile acme-dev
aws sts get-caller-identity --profile acme-dev --region eu-central-1 --output json --no-cli-pager
```

### 3.2 Preferred (automation on AWS): roles from the environment

- If running on **EC2** with an instance role, you MUST NOT configure local credentials; the CLI auto-retrieves them. ([awscli.amazonaws.com][2])
- Similarly, for containerized workloads you SHOULD use task/IRSA/OIDC-style role mechanisms rather than static keys (implementation varies by platform, but the principle is “no long-term keys”).

### 3.3 Acceptable fallback: access keys (local dev only, tightly controlled)

- AWS recommends using **temporary credentials (roles)** instead of long-term access keys. ([AWS Documentation][8])
- If access keys are unavoidable:
  - You MUST isolate them into a dedicated profile.
  - You MUST rotate them per your org policy.
  - You MUST keep `~/.aws/credentials` out of any VCS/dotfile sync.

---

## 4) Profile management standards

### 4.1 Naming convention (deterministic)

You SHOULD name profiles as:

`<org>-<account|env>-<permission-set|role>-<region?>`

Examples:

- `acme-prod-readonly`
- `acme-dev-admin`
- `acme-sbx-poweruser-eu-central-1`

Reason: agents can pick profiles deterministically and avoid “default-profile drift”.

### 4.2 Required “profile hygiene” commands

Agents MUST be able to discover and inspect profiles:

- List profiles:

  ```bash
  aws configure list-profiles --no-cli-pager
  ```

  ([AWS Documentation][9])

- Show resolved configuration sources (where values came from):

  ```bash
  aws configure list --profile acme-dev --no-cli-pager
  ```

  ([AWS Documentation][10])

- Set/get config values deterministically:

  ```bash
  aws configure set region eu-central-1 --profile acme-dev
  aws configure get region --profile acme-dev
  ```

  ([AWS Documentation][3])

---

## 5) How to store local credential profiles (practical recipes)

### 5.1 Long-lived keys (discouraged, but common)

`~/.aws/credentials`

```ini
[acme-dev]
aws_access_key_id = AKIA...
aws_secret_access_key = ...
```

`~/.aws/config`

```ini
[profile acme-dev]
region = eu-central-1
output = json
cli_pager =
```

Notes:

- Credentials in `credentials` override `config`. ([AWS Documentation][3])
- Empty `cli_pager` disables pager (or use `AWS_PAGER=""` / `--no-cli-pager`). ([AWS Documentation][1])

### 5.2 AssumeRole profiles (recommended for cross-account)

Put role configuration in `~/.aws/config` (role settings are config-file only). ([AWS Documentation][4])

Example:

```ini
[profile acme-prod-admin]
role_arn = arn:aws:iam::123456789012:role/AdminRole
source_profile = acme-dev
role_session_name = paldenes-cli
region = eu-central-1
output = json
```

- `role_session_name` SHOULD be set for traceability in logs (e.g., CloudTrail). ([AWS Documentation][11])
- The CLI caches assumed-role creds under `~/.aws/cli/cache` and refreshes them when needed. ([AWS Documentation][4])

### 5.3 SSO profiles (recommended for humans)

You MUST configure SSO via the AWS CLI workflow and then login.

Core behavior:

- `aws sso login` retrieves and caches an Identity Center access token for the configured profile/session. ([AWS Documentation][7])

### 5.4 `credential_process` (advanced: integrate with a vault / external auth)

If your org uses an external credential broker, use `credential_process` in `~/.aws/config`. ([AWS Documentation][4])

Example:

```ini
[profile acme-brokered]
credential_process = /usr/local/bin/acme-aws-cred-helper --profile acme
region = eu-central-1
output = json
```

Rules:

- The external process MUST print JSON credentials to stdout in the required format. ([AWS Documentation][4])
- The AWS CLI **does not cache** `credential_process` credentials; caching MUST be implemented by the external helper if needed. ([AWS Documentation][4])
- Because this can be risky if the command becomes exposed, you MUST secure config and helper tooling. ([AWS Documentation][12])

### 5.5 Exporting resolved credentials (for interoperability)

AWS CLI v2 provides:

```bash
aws configure export-credentials --profile acme-dev
```

This exports creds in formats (default `process`) intended for credential-process consumers. ([AWS Documentation][13])

---

## 6) CLI usage standards (what agents MUST do every time)

### 6.1 Global flags standard

For automation/scripting, agents MUST use:

- `--no-cli-pager` (avoid interactive output) ([AWS Documentation][1])
- `--output json`
- `--profile …` (explicit)
- `--region …` (explicit)

Example baseline template:

```bash
aws <service> <operation> \
  --profile acme-dev \
  --region eu-central-1 \
  --output json \
  --no-cli-pager
```

### 6.2 Pagination standard

- For list operations, you SHOULD accept default auto-pagination when you truly need the full dataset.
- If you only need the first page (faster/cheaper), you MUST use `--no-paginate`. ([AWS Documentation][14])

### 6.3 Output reduction (`--query`) standard

- You SHOULD use `--query` to reduce response size at the source (client-side JMESPath).
- You MUST keep outputs JSON when downstream parsing matters.

Example:

```bash
aws ec2 describe-instances \
  --profile acme-dev --region eu-central-1 \
  --query "Reservations[].Instances[].{Id:InstanceId,Type:InstanceType,State:State.Name}" \
  --output json --no-cli-pager
```

### 6.4 Retries/timeouts standard

- You SHOULD configure retries via shared config variables (`retry_mode`, `max_attempts`) when operating in unreliable networks or rate-limited environments. ([AWS Documentation][4])
- You MUST NOT implement “infinite retry” loops around AWS CLI calls.

---

## 7) Safe change patterns (create/update/delete) for agents

1. **You MUST preflight with “describe” before “create”.**
   - Example: `describe-*`, `list-*`, `get-*` first.

2. **You MUST check for idempotency.**
   - If a create is not idempotent, you MUST search by name/tag first.
   - You SHOULD use consistent tagging so you can deterministically find resources you created.

3. **You MUST use `--dry-run` where supported.**
   - Many EC2/IAM-style operations support `--dry-run`; when present, it’s mandatory for a first pass.

4. **You MUST wait for eventual consistency where relevant.**
   - You SHOULD use service “waiters” (`aws <service> wait ...`) when subsequent steps depend on a resource becoming ready.

5. **You MUST emit an auditable command log.**
   - Log: timestamp, command string, profile, region, `sts get-caller-identity` output, and the command JSON result.

---

## 8) Troubleshooting playbook (agent-ready)

### Symptom: “Unable to locate credentials”

Agent steps:

1. `aws configure list --profile <p>` to see what source is being used. ([AWS Documentation][10])
2. If SSO profile: run `aws sso login --profile <p>`. ([AWS Documentation][7])
3. Confirm file locations or overrides (`AWS_CONFIG_FILE`, `AWS_SHARED_CREDENTIALS_FILE`). ([awscli.amazonaws.com][2])

### Symptom: “ExpiredToken” / auth failures mid-run

- If using assumed roles: credentials are cached and refreshed automatically; confirm you’re not overriding with env vars. ([AWS Documentation][4])
- If using SSO: `aws sso login --profile <p>` again. ([AWS Documentation][7])

### Symptom: pager hijacks output / scripts hang

- Add `--no-cli-pager` or set `AWS_PAGER=""`. ([AWS Documentation][1])

### Symptom: wrong account used

- Immediately run:

  ```bash
  aws sts get-caller-identity --profile <p> --region <r> --output json --no-cli-pager
  ```

- Then inspect precedence: command line > env vars > files. ([awscli.amazonaws.com][2])

---

## 9) Minimal agent “preflight checklist” (copy/paste)

Before any AWS work, the agent MUST ensure:

```bash
aws --version
aws configure list-profiles --no-cli-pager
aws configure list --profile <profile> --no-cli-pager
aws sts get-caller-identity --profile <profile> --region <region> --output json --no-cli-pager
```

If SSO:

```bash
aws sso login --profile <profile>
aws sts get-caller-identity --profile <profile> --region <region> --output json --no-cli-pager
```

([AWS Documentation][9])

---

[1]: https://docs.aws.amazon.com/cli/latest/topic/config-vars.html?utm_source=chatgpt.com 'AWS CLI Configuration Variables'
[2]: https://awscli.amazonaws.com/v2/documentation/api/2.13.19/topic/config-vars.html 'AWS CLI Configuration Variables — AWS CLI 2.13.19 Command Reference'
[3]: https://docs.aws.amazon.com/cli/v1/userguide/cli-configure-files.html?utm_source=chatgpt.com 'Configuration and credential file settings in the AWS CLI'
[4]: https://docs.aws.amazon.com/cli/latest/topic/config-vars.html 'AWS CLI Configuration Variables — AWS CLI 2.33.13 Command Reference'
[5]: https://docs.aws.amazon.com/sdkref/latest/guide/file-format.html?utm_source=chatgpt.com 'Using shared config and credentials files to globally ...'
[6]: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html?utm_source=chatgpt.com 'Configuring IAM Identity Center authentication with the ...'
[7]: https://docs.aws.amazon.com/cli/latest/reference/sso/login.html?utm_source=chatgpt.com 'login — AWS CLI 2.33.24 Command Reference'
[8]: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html?utm_source=chatgpt.com 'Manage access keys for IAM users'
[9]: https://docs.aws.amazon.com/cli/latest/reference/configure/list-profiles.html?utm_source=chatgpt.com 'list-profiles — AWS CLI 2.33.22 Command Reference'
[10]: https://docs.aws.amazon.com/cli/latest/reference/configure/list.html?utm_source=chatgpt.com 'list — AWS CLI 2.33.25 Command Reference'
[11]: https://docs.aws.amazon.com/cli/v1/userguide/cli-configure-role.html?utm_source=chatgpt.com 'Using an IAM role in the AWS CLI'
[12]: https://docs.aws.amazon.com/cli/v1/userguide/cli-configure-sourcing-external.html?utm_source=chatgpt.com 'Sourcing credentials with an external process in the AWS CLI'
[13]: https://docs.aws.amazon.com/cli/latest/reference/configure/export-credentials.html?utm_source=chatgpt.com 'export-credentials — AWS CLI 2.33.22 Command Reference'
[14]: https://docs.aws.amazon.com/cli/v1/userguide/cli-usage-pagination.html?utm_source=chatgpt.com 'Using the pagination options in the AWS CLI'
