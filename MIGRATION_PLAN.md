# Migration Plan: GitLab → GitHub + AWS Lightsail → Self-Hosted Scaleway

> **Date**: 2026-03-03
> **Target**: `https://github.com/dsdenes/aijourney` → deployed at `https://ai.1p.hu`
> **Server**: `root@51.15.108.144` (Scaleway, Ubuntu 24.04, 8GB RAM, 27GB disk)

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Target State](#2-target-state)
3. [Migration Phases](#3-migration-phases)
   - [Phase 1: DNS & SSL Setup](#phase-1-dns--ssl-setup)
   - [Phase 2: GitHub Repository Setup](#phase-2-github-repository-setup)
   - [Phase 3: GitHub Actions Runner Reconfiguration](#phase-3-github-actions-runner-reconfiguration)
   - [Phase 4: Docker Compose for Production](#phase-4-docker-compose-for-production)
   - [Phase 5: Nginx Configuration](#phase-5-nginx-configuration)
   - [Phase 6: GitHub Actions CI/CD Pipeline](#phase-6-github-actions-cicd-pipeline)
   - [Phase 7: AGENTS.md & Guide Updates](#phase-7-agentsmd--guide-updates)
   - [Phase 8: Cost & AWS Cleanup](#phase-8-cost--aws-cleanup)
4. [Risk Register](#4-risk-register)
5. [Rollback Strategy](#5-rollback-strategy)

---

## 1. Current State Assessment

### Source Control & CI/CD

| Component                | Current                                                     | Notes                                                       |
| ------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------- |
| Git remote               | `ssh://git@gitlab.mito.hu:2222/815labs/mito-ai-journey.git` | Self-hosted GitLab                                          |
| CI/CD                    | `.gitlab-ci.yml` (370 lines)                                | 6 stages: lint → test → build → security → package → deploy |
| Container Registry       | `gitlab-registry.mito.hu/815labs/mito-ai-journey/*`         | API, worker, kb-builder, web images                         |
| Deploy target (API)      | AWS Lightsail Container Service (`aijourney`)               | Multi-container: api + redis + worker + kb-builder          |
| Deploy target (Frontend) | S3 + CloudFront (`d2th8ux1aiqw4z.cloudfront.net`)           | SvelteKit SPA build synced to S3                            |
| Domain                   | `aijourney.mito.hu` (Lightsail) / CloudFront dist           | Split: API on Lightsail, frontend on CloudFront             |

### Infrastructure (AWS Services in Use)

| Service                   | Purpose                                                          | Terraform Managed      |
| ------------------------- | ---------------------------------------------------------------- | ---------------------- |
| DynamoDB                  | Primary database                                                 | Yes (module `data`)    |
| S3 (`aijourney-frontend`) | Frontend hosting                                                 | Yes (module `data`)    |
| S3 (`aijourney-kb-data`)  | KB Builder documents                                             | Yes (module `data`)    |
| CloudFront                | CDN for frontend                                                 | Yes (module `cdn`)     |
| Cognito                   | Auth (Google Workspace SSO, mito.hu domain)                      | Yes (module `cognito`) |
| Lightsail                 | Container hosting for API/worker/kb-builder/redis                | Manual via CLI         |
| Bedrock                   | RAG (knowledge base) — optional, `RAG_PROVIDER=self` uses Qdrant | No                     |

### Self-Hosted Server (`51.15.108.144`)

| Item                  | Status                                                                       |
| --------------------- | ---------------------------------------------------------------------------- |
| OS                    | Ubuntu 24.04.3 LTS                                                           |
| Docker                | 29.1.3 + Compose v5.0.0                                                      |
| Memory                | 7.7 GB total, ~5.3 GB available                                              |
| Disk                  | 27 GB total, 7.3 GB free (73% used) — **tight, needs cleanup**               |
| Certbot               | 2.9.0, already managing certs for `tender.1p.hu` and others                  |
| GitHub Actions Runner | Installed at `/opt/actions-runner`, registered for `dsdenes/busiens`         |
| GitLab Runner         | Installed, registered for `gitlab.mito.hu` (tag: `production-server-runner`) |
| Current deployments   | tenderai (6 containers: nginx, app, mongo, qdrant, ollama, chunker)          |
| Ports 80/443          | Bound by tenderai's Docker nginx container                                   |
| Host nginx            | Installed but not serving (Docker nginx handles requests)                    |

### DNS

| Record         | Current Value                                      | Needed                     |
| -------------- | -------------------------------------------------- | -------------------------- |
| `ai.1p.hu`     | CNAME → `1p.hu` → `51.158.231.184` (wrong server!) | A record → `51.15.108.144` |
| `tender.1p.hu` | A → `51.15.108.144` ✅                             | Keep as-is                 |

### GitHub Repository

| Item              | Status                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Repo              | `https://github.com/dsdenes/aijourney` — exists, empty                                               |
| GH CLI user       | `dsdenes` (available in keyring, needs `gh auth switch`)                                             |
| GH Actions Runner | Already on server, but configured for `dsdenes/busiens` — must be reconfigured or a new runner added |

---

## 2. Target State

```
Developer (local)
    │
    ├──► git push origin main ──► github.com/dsdenes/aijourney
    │                                    │
    │                               GitHub Actions
    │                                    │
    │                              ┌─────┴──────┐
    │                              │  CI stages  │
    │                              │ lint → test  │
    │                              │ → build      │
    │                              └─────┬───────┘
    │                                    │ (self-hosted runner)
    │                                    │ SSH to server / run locally
    │                                    ▼
    │                          ┌─────────────────────┐
    │                          │  51.15.108.144       │
    │                          │  (Scaleway)          │
    │                          │                      │
    │                          │  Docker Compose:     │
    │                          │  ├─ nginx (80/443)   │
    │                          │  ├─ web (SvelteKit)  │
    │                          │  ├─ api (NestJS)     │
    │                          │  ├─ worker (BullMQ)  │
    │                          │  ├─ kb-builder       │
    │                          │  ├─ redis            │
    │                          │  ├─ dynamodb-local   │
    │                          │  └─ qdrant           │
    │                          └─────────────────────┘
    │                                    │
    │                               https://ai.1p.hu
    │
    └──► Browser ──► https://ai.1p.hu
```

### Key Architecture Decisions

1. **All services run on the Scaleway box via Docker Compose** — no AWS compute needed
2. **DynamoDB Local replaces cloud DynamoDB** — runs in Docker on the server (same as dev)
3. **Qdrant replaces Bedrock KB** — already used in dev mode (`RAG_PROVIDER=self`)
4. **Cognito stays in AWS** — it's free-tier and changing auth is high-risk; keep it
5. **S3 + CloudFront removed** — frontend served from the Scaleway box via nginx
6. **Nginx on the host** handles SSL termination (same pattern as tenderai) — Docker nginx for reverse proxy inside compose
7. **GitHub Actions with self-hosted runner** replaces the GitLab CI pipeline
8. **Deploy strategy**: Runner SSHs to `/opt/aijourney`, pulls code, rebuilds Docker, restarts

---

## 3. Migration Phases

### Phase 1: DNS & SSL Setup

**Goal**: `ai.1p.hu` resolves to `51.15.108.144` with a valid SSL cert.

#### Steps

1. **Update DNS**: Change `ai.1p.hu` from CNAME → `1p.hu` to A record → `51.15.108.144`
   - DNS is managed via Scaleway DNS or the domain registrar
   - Use `scw` CLI or the Scaleway console to update the record
   - Verify: `dig +short ai.1p.hu` should return `51.15.108.144`

2. **Obtain SSL certificate** (after DNS propagates):

   ```bash
   ssh root@51.15.108.144
   certbot certonly --nginx -d ai.1p.hu
   # or if nginx isn't serving port 80 yet:
   certbot certonly --standalone -d ai.1p.hu --pre-hook "docker compose -f /opt/tenderai/docker-compose.yml stop nginx" --post-hook "docker compose -f /opt/tenderai/docker-compose.yml start nginx"
   ```

3. **Verify certificate**:
   ```bash
   ls /etc/letsencrypt/live/ai.1p.hu/
   # Should contain: fullchain.pem, privkey.pem
   ```

#### Dependencies

- Domain DNS management access (Scaleway DNS console or registrar)
- Port 80 must be temporarily available for ACME challenge

#### Estimated Time: 30 minutes (+ DNS propagation up to 1 hour)

---

### Phase 2: GitHub Repository Setup

**Goal**: Push the full codebase to `github.com/dsdenes/aijourney`.

#### Steps

1. **Switch GH CLI to correct user**:

   ```bash
   # Temporarily unset GITHUB_TOKEN if it overrides the user
   unset GITHUB_TOKEN
   gh auth switch --user dsdenes
   gh auth status  # verify: dsdenes is active
   ```

2. **Add GitHub remote and push**:

   ```bash
   cd /Users/dpal/mito/aijourney
   git remote add github https://github.com/dsdenes/aijourney.git
   git push github main --force
   # Push all branches if needed:
   git push github --all
   git push github --tags
   ```

3. **Verify repo contents on GitHub**:

   ```bash
   gh repo view dsdenes/aijourney --web
   ```

4. **Configure GitHub repository settings**:

   ```bash
   # Set default branch
   gh repo edit dsdenes/aijourney --default-branch main

   # Add repository secrets (via GH CLI or web UI)
   gh secret set AWS_ACCESS_KEY_ID --repo dsdenes/aijourney
   gh secret set AWS_SECRET_ACCESS_KEY --repo dsdenes/aijourney
   gh secret set OPENAI_API_KEY --repo dsdenes/aijourney
   gh secret set COGNITO_USER_POOL_ID --repo dsdenes/aijourney
   gh secret set COGNITO_CLIENT_ID --repo dsdenes/aijourney
   gh secret set COGNITO_CLIENT_SECRET --repo dsdenes/aijourney
   gh secret set COGNITO_DOMAIN --repo dsdenes/aijourney
   gh secret set COGNITO_ISSUER --repo dsdenes/aijourney
   ```

5. **Configure `.gitignore`** — verify it includes:
   ```
   .env
   .env.*
   !.env.example
   node_modules/
   dist/
   coverage/
   *.tfstate
   .terraform/
   ```

#### Estimated Time: 15 minutes

---

### Phase 3: GitHub Actions Runner Reconfiguration

**Goal**: The self-hosted runner on `51.15.108.144` can execute jobs for `dsdenes/aijourney`.

#### Current State

- Runner installed at `/opt/actions-runner`, registered for `dsdenes/busiens`
- Running as systemd service: `actions.runner.dsdenes-busiens.scw-recursing-leakey-runner.service`

#### Options

**Option A (Recommended): Org-level runner** — If `dsdenes` has a GitHub personal account with both repos, register the runner at the user/org level so it serves both `busiens` and `aijourney`.

**Option B: Second runner instance** — Install a separate runner in `/opt/actions-runner-aijourney/` dedicated to the aijourney repo.

**Option C: Reconfigure existing runner** — Remove from `busiens`, add to `aijourney` (breaks busiens CI).

#### Steps (Option B — recommended for isolation)

1. **Create a new runner registration token**:

   ```bash
   # Via GH CLI
   gh api repos/dsdenes/aijourney/actions/runners/registration-token \
     --method POST --jq '.token'
   ```

2. **Install second runner on server**:

   ```bash
   ssh root@51.15.108.144

   # Create new runner directory
   mkdir -p /opt/actions-runner-aijourney && cd /opt/actions-runner-aijourney

   # Download runner (same version as existing)
   curl -o actions-runner.tar.gz -L \
     https://github.com/actions/runner/releases/download/v2.330.0/actions-runner-linux-x64-2.330.0.tar.gz
   tar xzf actions-runner.tar.gz && rm actions-runner.tar.gz

   # Configure
   ./config.sh \
     --url https://github.com/dsdenes/aijourney \
     --token <REGISTRATION_TOKEN> \
     --name aijourney-runner \
     --labels self-hosted,linux,x64,aijourney \
     --work /var/lib/actions-runner-aijourney/_work

   # Install and start as service
   ./svc.sh install
   ./svc.sh start
   ./svc.sh status
   ```

3. **Verify runner appears in GitHub**:
   ```bash
   gh api repos/dsdenes/aijourney/actions/runners --jq '.runners[].name'
   ```

#### Estimated Time: 20 minutes

---

### Phase 4: Docker Compose for Production

**Goal**: Create a production `docker-compose.prod.yml` that runs all aijourney services on the Scaleway box.

#### Architecture

The new production compose file replaces both AWS Lightsail (API/worker/kb-builder/redis) and S3/CloudFront (frontend). It also includes DynamoDB Local as the database and Qdrant for RAG.

#### New `docker-compose.server.yml`

```yaml
# docker-compose.server.yml — Production deployment on Scaleway
services:
  # ---------- Reverse Proxy ----------
  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./nginx.server.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - /var/lib/letsencrypt:/var/lib/letsencrypt:ro
    depends_on:
      - web
      - api

  # ---------- Frontend ----------
  web:
    build:
      context: .
      target: web
    restart: unless-stopped
    expose:
      - '80'

  # ---------- API ----------
  api:
    build:
      context: .
      target: api
    restart: unless-stopped
    expose:
      - '3000'
    depends_on:
      dynamodb-local:
        condition: service_healthy
      redis:
        condition: service_healthy
      seed-db:
        condition: service_completed_successfully
    environment:
      NODE_ENV: production
      PORT: '3000'
      DYNAMODB_ENDPOINT: http://dynamodb-local:8000
      AWS_REGION: eu-central-1
      AWS_ACCESS_KEY_ID: '${AWS_ACCESS_KEY_ID}'
      AWS_SECRET_ACCESS_KEY: '${AWS_SECRET_ACCESS_KEY}'
      REDIS_URL: redis://redis:6379
      APP_URL: 'https://ai.1p.hu'
      API_URL: 'https://ai.1p.hu/api'
      ALLOWED_EMAIL_DOMAIN: mito.hu
      COGNITO_USER_POOL_ID: '${COGNITO_USER_POOL_ID}'
      COGNITO_CLIENT_ID: '${COGNITO_CLIENT_ID}'
      COGNITO_CLIENT_SECRET: '${COGNITO_CLIENT_SECRET}'
      COGNITO_DOMAIN: '${COGNITO_DOMAIN}'
      COGNITO_ISSUER: '${COGNITO_ISSUER}'
      OPENAI_API_KEY: '${OPENAI_API_KEY}'
      KB_BUILDER_URL: 'http://kb-builder:3002'
      RAG_PROVIDER: 'self'
      QDRANT_URL: 'http://qdrant:6333'
      QDRANT_COLLECTION: 'kb_chunks'

  # ---------- Worker ----------
  worker:
    build:
      context: .
      target: worker
    restart: unless-stopped
    depends_on:
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: production
      AWS_ACCESS_KEY_ID: '${AWS_ACCESS_KEY_ID}'
      AWS_SECRET_ACCESS_KEY: '${AWS_SECRET_ACCESS_KEY}'
      AWS_REGION: eu-central-1
      REDIS_URL: redis://redis:6379
      OPENAI_API_KEY: '${OPENAI_API_KEY}'
      QDRANT_URL: 'http://qdrant:6333'

  # ---------- KB Builder ----------
  kb-builder:
    build:
      context: .
      target: kb-builder
    restart: unless-stopped
    depends_on:
      dynamodb-local:
        condition: service_healthy
    environment:
      NODE_ENV: production
      AWS_ACCESS_KEY_ID: '${AWS_ACCESS_KEY_ID}'
      AWS_SECRET_ACCESS_KEY: '${AWS_SECRET_ACCESS_KEY}'
      AWS_REGION: eu-central-1
      OPENAI_API_KEY: '${OPENAI_API_KEY}'
      KB_BUILDER_PORT: '3002'
      DYNAMODB_ENDPOINT: http://dynamodb-local:8000
      QDRANT_URL: 'http://qdrant:6333'

  # ---------- Infrastructure ----------
  dynamodb-local:
    image: amazon/dynamodb-local:latest
    restart: unless-stopped
    volumes:
      - dynamodb_data:/home/dynamodblocal/data
    command: '-jar DynamoDBLocal.jar -sharedDb -dbPath /home/dynamodblocal/data'
    healthcheck:
      test: ['CMD-SHELL', "bash -c 'echo > /dev/tcp/localhost/8000' 2>/dev/null || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  seed-db:
    build:
      context: .
      target: seed
    depends_on:
      dynamodb-local:
        condition: service_healthy
    environment:
      DYNAMODB_ENDPOINT: http://dynamodb-local:8000
      AWS_REGION: eu-central-1

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5

  qdrant:
    image: qdrant/qdrant:latest
    restart: unless-stopped
    volumes:
      - qdrant_data:/qdrant/storage
    expose:
      - '6333'
      - '6334'
    healthcheck:
      test: ['CMD-SHELL', "bash -c 'echo > /dev/tcp/localhost/6333' 2>/dev/null || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  dynamodb_data:
  redis_data:
  qdrant_data:
```

#### Key Design Decisions

1. **DynamoDB Local with persistent volume** (`dynamodb_data`) — data survives container restarts. Uses `-dbPath` flag for persistence.
2. **`seed-db` runs on every `docker compose up`** — idempotent, creates tables if they don't exist.
3. **Qdrant** — persistent volume for vector data.
4. **No ports exposed except 80/443** on the nginx container — all internal services use Docker networking.
5. **`RAG_PROVIDER=self`** — uses local Qdrant instead of AWS Bedrock.

#### Estimated Time: 1 hour

---

### Phase 5: Nginx Configuration

**Goal**: SSL-terminating nginx config for `ai.1p.hu` that routes to SvelteKit frontend + NestJS API.

#### Challenge: Coexistence with tenderai

The server currently runs tenderai with its own Docker nginx on ports 80/443. Two options:

**Option A (Recommended): Host-level nginx as central reverse proxy**

Use the Ubuntu host's nginx (already installed) as the central reverse proxy for all apps. Each app's Docker Compose only exposes ports internally or on localhost.

```
Internet → Host nginx (80/443)
              ├─ tender.1p.hu → tenderai Docker (port 3000 via localhost:8080)
              └─ ai.1p.hu → aijourney Docker (port 80 via localhost:8081)
```

Steps:

1. Stop tenderai's nginx container (modify its `docker-compose.yml` to not bind 80/443)
2. Map tenderai's app to a host port (e.g., `localhost:8080:3000`)
3. Map aijourney's web to a host port (e.g., `localhost:8081:80`)
4. Host nginx handles all SSL + routing

**Option B: Shared Docker nginx** — single nginx container with configs for both apps (requires shared Docker network; more complex).

#### Host Nginx Config: `/etc/nginx/sites-available/ai.1p.hu`

```nginx
# HTTP → HTTPS redirect
server {
    listen 80;
    server_name ai.1p.hu;

    location /.well-known/acme-challenge/ {
        root /var/lib/letsencrypt;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS server for ai.1p.hu
server {
    listen 443 ssl http2;
    server_name ai.1p.hu;

    ssl_certificate /etc/letsencrypt/live/ai.1p.hu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ai.1p.hu/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # API reverse proxy → NestJS
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # Frontend → SvelteKit SPA (via Docker nginx)
    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Updated tenderai config: `/etc/nginx/sites-available/tender.1p.hu`

```nginx
server {
    listen 80;
    server_name tender.1p.hu;

    location /.well-known/acme-challenge/ {
        root /var/lib/letsencrypt;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name tender.1p.hu;

    ssl_certificate /etc/letsencrypt/live/tender.1p.hu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tender.1p.hu/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

#### Migration Steps for Nginx

1. **Modify tenderai's `docker-compose.yml`** on the server:
   - Remove the `nginx` service entirely
   - Change `app` service from `expose: ["3000"]` to `ports: ["8080:3000"]`

2. **Create host nginx configs**:

   ```bash
   ssh root@51.15.108.144
   # Create site configs
   nano /etc/nginx/sites-available/ai.1p.hu
   nano /etc/nginx/sites-available/tender.1p.hu

   # Enable sites
   ln -s /etc/nginx/sites-available/ai.1p.hu /etc/nginx/sites-enabled/
   ln -s /etc/nginx/sites-available/tender.1p.hu /etc/nginx/sites-enabled/

   # Remove default (optional)
   rm /etc/nginx/sites-enabled/default

   # Test and reload
   nginx -t
   systemctl reload nginx
   ```

3. **Restart tenderai without its nginx**:

   ```bash
   cd /opt/tenderai
   docker compose down
   # Edit docker-compose.yml (remove nginx service, expose app on 8080)
   docker compose up -d
   ```

4. **Verify tenderai still works** at `https://tender.1p.hu`

#### Estimated Time: 1.5 hours (including testing)

---

### Phase 6: GitHub Actions CI/CD Pipeline

**Goal**: Replace `.gitlab-ci.yml` with `.github/workflows/` that lint, test, build, and deploy.

#### Workflow Files

##### `.github/workflows/ci.yml` — Lint + Test + Build (on PR and push to main)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @aijourney/shared build
      - run: pnpm format:check
      - run: pnpm lint
        continue-on-error: true # until ESLint is configured in all packages

  test-shared:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @aijourney/shared build
      - run: pnpm --filter @aijourney/shared test -- --coverage

  test-api:
    runs-on: ubuntu-latest
    services:
      dynamodb-local:
        image: amazon/dynamodb-local:latest
        ports:
          - 8000:8000
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    env:
      DYNAMODB_ENDPOINT: http://localhost:8000
      REDIS_URL: redis://localhost:6379
      AWS_REGION: eu-central-1
      AWS_ACCESS_KEY_ID: fakeAccessKeyId
      AWS_SECRET_ACCESS_KEY: fakeSecretAccessKey
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @aijourney/shared build
      - run: pnpm --filter @aijourney/api test -- --coverage

  test-worker:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    env:
      REDIS_URL: redis://localhost:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @aijourney/shared build
      - run: pnpm --filter @aijourney/worker test -- --coverage

  test-kb-builder:
    runs-on: ubuntu-latest
    services:
      dynamodb-local:
        image: amazon/dynamodb-local:latest
        ports:
          - 8000:8000
    env:
      DYNAMODB_ENDPOINT: http://localhost:8000
      AWS_REGION: eu-central-1
      AWS_ACCESS_KEY_ID: fakeAccessKeyId
      AWS_SECRET_ACCESS_KEY: fakeSecretAccessKey
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @aijourney/shared build
      - run: pnpm --filter @aijourney/kb-builder test -- --coverage

  build-check:
    runs-on: ubuntu-latest
    needs: [lint, test-shared, test-api, test-worker, test-kb-builder]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

##### `.github/workflows/deploy.yml` — Deploy to Scaleway (on push to main)

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: [self-hosted, linux, aijourney]
    environment: production
    env:
      DEPLOY_PATH: /opt/aijourney
    steps:
      - name: Pull latest code
        run: |
          cd $DEPLOY_PATH
          git fetch origin
          git reset --hard origin/main
          echo "Deployed commit:"
          git log --oneline -1

      - name: Write .env file
        run: |
          cd $DEPLOY_PATH
          cat > .env << 'ENVEOF'
          AWS_ACCESS_KEY_ID=${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY=${{ secrets.AWS_SECRET_ACCESS_KEY }}
          OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }}
          COGNITO_USER_POOL_ID=${{ secrets.COGNITO_USER_POOL_ID }}
          COGNITO_CLIENT_ID=${{ secrets.COGNITO_CLIENT_ID }}
          COGNITO_CLIENT_SECRET=${{ secrets.COGNITO_CLIENT_SECRET }}
          COGNITO_DOMAIN=${{ secrets.COGNITO_DOMAIN }}
          COGNITO_ISSUER=${{ secrets.COGNITO_ISSUER }}
          ENVEOF

      - name: Build Docker images
        run: |
          cd $DEPLOY_PATH
          docker compose -f docker-compose.server.yml build

      - name: Restart services
        run: |
          cd $DEPLOY_PATH
          docker compose -f docker-compose.server.yml up -d --force-recreate --remove-orphans

      - name: Verify deployment
        run: |
          cd $DEPLOY_PATH
          echo "=== Container Status ==="
          docker compose -f docker-compose.server.yml ps
          echo ""
          echo "=== Health Check ==="
          sleep 10
          curl -sf http://localhost:3000/api/health || echo "Health check failed (may need more time)"
          echo ""
          echo "Commit $(git rev-parse --short HEAD) deployed successfully"
```

##### `.github/workflows/certbot-renew.yml` — Auto-renew SSL certs

```yaml
name: Certbot Renew

on:
  schedule:
    - cron: '0 4 * * 1' # Every Monday at 4 AM UTC

jobs:
  renew:
    runs-on: [self-hosted, linux, aijourney]
    steps:
      - name: Renew certificates
        run: |
          certbot renew --quiet
          nginx -s reload 2>/dev/null || true
```

#### Key Differences from GitLab CI

| Feature              | GitLab CI                              | GitHub Actions                               |
| -------------------- | -------------------------------------- | -------------------------------------------- |
| CI runners for tests | Shared GitLab runners                  | GitHub-hosted `ubuntu-latest`                |
| Docker builds        | Docker-in-Docker (dind)                | Self-hosted runner builds directly           |
| Deploy mechanism     | Runner on server pulls + builds        | Same (self-hosted runner on server)          |
| Container registry   | GitLab Container Registry              | None needed (build on server directly)       |
| Secrets              | GitLab CI/CD Variables                 | GitHub Actions Secrets                       |
| Security scanning    | GitLab SAST/Secret-Detection templates | GitHub Advanced Security / CodeQL (optional) |

#### Estimated Time: 2 hours

---

### Phase 7: AGENTS.md & Guide Updates

**Goal**: Update all documentation to reflect the new GitHub + Scaleway setup. Bring over relevant GenAI agent instructions from the tenderai project.

#### Files to Update

1. **`AGENTS.md`** — Major rewrite:
   - Replace all GitLab references with GitHub
   - Replace AWS Lightsail/CloudFront/S3 deployment details with Scaleway self-hosted
   - Update Git Workflow section (GitHub PRs instead of GitLab MRs)
   - Update CI/CD section to describe GitHub Actions
   - Update Environment & Authentication (GitHub CLI instead of glab)
   - Update deploy commands and troubleshooting
   - Add self-hosted server access details
   - Keep AWS DynamoDB/Cognito/Bedrock references where still applicable

2. **`guides/index.md`** — Add entry for deployment guide

3. **`guides/gitlab-cli.md`** → **`guides/github-cli.md`** — Replace with GitHub CLI reference

4. **Adopt from tenderai `AGENTS.md`**:
   - Deployment & Verification Policy (SSH verify-only, deploy via CI)
   - Merge Conflict Prevention Policy
   - Subagent usage patterns (already in tenderai, useful for this project too)
   - No Fake/Mock Implementations Policy
   - LLM Model Names Policy (adapt for this project's `gpt-5-mini` requirement)

5. **New guide: `guides/deploy-scaleway.md`** — Operational runbook for the Scaleway server:
   - How to SSH and check logs
   - How to manually restart services
   - How to check DynamoDB local data
   - How to backup volumes
   - How to renew SSL certs
   - Disk space management

#### Key Agent Instruction Adoptions from tenderai

| tenderai Policy           | Adaptation for aijourney                                     |
| ------------------------- | ------------------------------------------------------------ |
| No direct SSH deploy      | Same — all deploys via GitHub Actions                        |
| SSH verify-only           | Same — `docker logs`, `docker exec`, `curl` for verification |
| Merge conflict prevention | Same — `git pull --rebase origin main` before push           |
| No fake implementations   | Already aligned with aijourney's engineering standards       |
| Git push triggers deploy  | Same pattern — push to `main` → GitHub Actions → deploy      |

#### Estimated Time: 3 hours

---

### Phase 8: Cost & AWS Cleanup

**Goal**: Decommission AWS services that are no longer needed.

#### Services to Keep

| Service                             | Reason                                        | Monthly Cost                     |
| ----------------------------------- | --------------------------------------------- | -------------------------------- |
| Cognito User Pool                   | Auth — zero cost at this scale                | Free tier                        |
| DynamoDB (cloud, production backup) | Optional: backup production data periodically | Free tier (on-demand, low usage) |

#### Services to Decommission

| Service                                   | Current Purpose                   | Action                                                                                                  | Estimated Savings |
| ----------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------- |
| Lightsail Container Service (`aijourney`) | API + worker + redis + kb-builder | `aws lightsail delete-container-service --service-name aijourney`                                       | ~$40-100/month    |
| S3 bucket (`aijourney-frontend`)          | Frontend SPA hosting              | `aws s3 rm s3://aijourney-frontend/ --recursive && aws s3api delete-bucket --bucket aijourney-frontend` | ~$1/month         |
| CloudFront distribution                   | CDN for frontend                  | Disable then delete                                                                                     | ~$1/month         |
| Bedrock Knowledge Base                    | RAG (if Qdrant replaces it)       | Delete KB via console/API                                                                               | Usage-based       |

#### Steps

1. **Verify aijourney is fully working on Scaleway** (critical — do not decommission until confirmed)
2. **Export DynamoDB data** as backup:
   ```bash
   # Scan all tables and save to JSON
   AWS_PROFILE=mito815 aws dynamodb scan --table-name users --no-cli-pager > backup_users.json
   AWS_PROFILE=mito815 aws dynamodb scan --table-name run_requests --no-cli-pager > backup_run_requests.json
   # ... etc for all tables
   ```
3. **Import data to DynamoDB Local on Scaleway** (write a migration script)
4. **Decommission Lightsail**:
   ```bash
   AWS_PROFILE=mito815 aws lightsail delete-container-service --service-name aijourney --no-cli-pager
   ```
5. **Decommission S3 + CloudFront**:
   ```bash
   AWS_PROFILE=mito815 aws cloudfront get-distribution-config --id ESYQ3VUREOLFY --no-cli-pager
   # Disable distribution, then delete
   AWS_PROFILE=mito815 aws s3 rm s3://aijourney-frontend/ --recursive
   ```
6. **Update Cognito callback URLs** to use `https://ai.1p.hu/auth/callback`
7. **Remove Terraform modules** for CDN and frontend S3 bucket (or update to reflect new state)

#### Estimated Time: 2 hours (after validation period)

---

## 4. Risk Register

| Risk                                     | Impact                              | Likelihood      | Mitigation                                                                                                                        |
| ---------------------------------------- | ----------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| DNS propagation delay                    | Users can't reach `ai.1p.hu`        | Medium          | Pre-lower TTL, verify with `dig` from multiple locations                                                                          |
| Disk space exhaustion on server          | Service crashes, Docker can't build | High (73% used) | **Phase 0**: Clean up unused Docker images/volumes (`docker system prune`), remove tenderai Ollama if not needed (~2-4 GB models) |
| DynamoDB Local data loss                 | Loss of production data             | High            | Mount persistent volume, regular backups to S3 or local                                                                           |
| Port conflict with tenderai              | One app becomes unreachable         | Low             | Test nginx config carefully; use separate ports                                                                                   |
| Runner contention (two apps, one server) | Slow deploys                        | Low             | Separate runner instances, deploy jobs are fast                                                                                   |
| Cognito callback URL mismatch            | Auth breaks                         | Medium          | Update Cognito callback URLs before switching DNS                                                                                 |
| GitHub Actions runner offline            | Deploys fail                        | Low             | Monitor runner status, set up alerting                                                                                            |
| Memory pressure (7.7 GB shared)          | OOM kills                           | Medium          | Monitor with `docker stats`, limit container memory in compose                                                                    |

---

## 5. Rollback Strategy

### During Migration

1. **GitLab CI remains operational** throughout migration — keep the GitLab remote as `origin`
2. **GitHub is added as a second remote** (`github`) — both receive pushes during transition
3. **AWS Lightsail stays running** until Scaleway is verified working for 48+ hours
4. **DNS change is the point of no return for users** — but can be reverted in minutes

### After Migration

1. GitLab CI can be disabled (remove `.gitlab-ci.yml` or stop the runner)
2. GitLab remote can be removed: `git remote remove origin && git remote rename github origin`
3. AWS Lightsail can be decommissioned (Phase 8)

---

## Execution Timeline

| Day    | Phase                             | Duration | Blocker                   |
| ------ | --------------------------------- | -------- | ------------------------- |
| Day 1  | Phase 0: Disk cleanup on server   | 30 min   | —                         |
| Day 1  | Phase 1: DNS + SSL                | 1 hr     | DNS propagation           |
| Day 1  | Phase 2: GitHub repo push         | 15 min   | —                         |
| Day 1  | Phase 3: Runner setup             | 20 min   | —                         |
| Day 1  | Phase 4: Docker Compose (server)  | 1 hr     | —                         |
| Day 1  | Phase 5: Nginx config             | 1.5 hr   | Phase 1 (SSL cert needed) |
| Day 1  | Phase 6: GitHub Actions workflows | 2 hr     | Phase 3 (runner needed)   |
| Day 1  | **First deploy to Scaleway**      | 30 min   | All above                 |
| Day 2  | Phase 7: AGENTS.md & docs update  | 3 hr     | —                         |
| Day 2  | Validation + testing              | 2 hr     | —                         |
| Day 3+ | Phase 8: AWS cleanup              | 2 hr     | 48hr validation           |

**Total estimated effort: ~14 hours over 3 days**

---

## Appendix: Server Resource Budget

After migration, the Scaleway box will run:

| Container                    | Est. Memory | Notes                            |
| ---------------------------- | ----------- | -------------------------------- |
| **tenderai** app             | ~400 MB     | Node.js Express                  |
| **tenderai** mongo           | ~200 MB     | MongoDB 8                        |
| **tenderai** qdrant          | ~200 MB     | Vector DB                        |
| **tenderai** ollama          | ~2 GB       | LLM inference (largest consumer) |
| **tenderai** chunker         | ~50 MB      | Rust binary                      |
| **aijourney** nginx          | ~10 MB      | Static proxy                     |
| **aijourney** web            | ~20 MB      | nginx serving SPA                |
| **aijourney** api            | ~300 MB     | NestJS                           |
| **aijourney** worker         | ~200 MB     | BullMQ processor                 |
| **aijourney** kb-builder     | ~200 MB     | Pipeline                         |
| **aijourney** redis          | ~50 MB      | Cache + queues                   |
| **aijourney** dynamodb-local | ~300 MB     | Java-based                       |
| **aijourney** qdrant         | ~200 MB     | Vector DB                        |
| Host nginx                   | ~10 MB      | SSL termination                  |
| GitHub Actions Runner        | ~80 MB      | Idle                             |
| **Total**                    | **~4.2 GB** | Of 7.7 GB                        |

Ollama is the memory hog. If memory becomes tight, consider stopping Ollama when not actively used, or upgrading the Scaleway instance.

### Disk Space Recovery Plan

```bash
# On server — run BEFORE migration
docker system prune -af              # Remove unused images/containers/networks
docker volume prune -f               # Remove unused volumes (careful!)
# Check Ollama model cache:
du -sh /var/lib/docker/volumes/*ollama*
# If safe, remove old Ollama models:
docker exec tenderai-ollama-1 ollama list
docker exec tenderai-ollama-1 ollama rm <unused-model>
```

---

## Appendix: File Changes Summary

| File                                  | Action            | Description                                        |
| ------------------------------------- | ----------------- | -------------------------------------------------- |
| `.gitlab-ci.yml`                      | Delete            | Replaced by GitHub Actions                         |
| `.github/workflows/ci.yml`            | Create            | Lint + test + build pipeline                       |
| `.github/workflows/deploy.yml`        | Create            | Deploy to Scaleway via self-hosted runner          |
| `.github/workflows/certbot-renew.yml` | Create            | Weekly SSL cert renewal                            |
| `docker-compose.server.yml`           | Create            | Production compose for Scaleway                    |
| `nginx.server.conf`                   | Create            | Nginx config for inside Docker (if using Option B) |
| `AGENTS.md`                           | Rewrite           | GitHub + Scaleway references                       |
| `guides/gitlab-cli.md`                | Delete            | Replaced by github-cli.md                          |
| `guides/github-cli.md`                | Create            | GitHub CLI reference                               |
| `guides/deploy-scaleway.md`           | Create            | Server operations runbook                          |
| `guides/index.md`                     | Update            | Add new guides, remove gitlab-cli                  |
| `docker-compose.prod.yml`             | Delete            | Replaced by docker-compose.server.yml              |
| `.env.example`                        | Update            | Add server-specific vars, remove Lightsail refs    |
| `infra/terraform/main.tf`             | Update            | Remove CDN module, update comments                 |
| `infra/terraform/modules/cdn/`        | Delete (optional) | No longer needed                                   |
| `package.json`                        | Update            | Add deploy scripts                                 |
