# =============================================================================
# Multi-stage Dockerfile for aijourney monorepo
# Usage: docker compose build (targets selected per service in docker-compose)
# =============================================================================

# ---- Base: Node 24 + pnpm ----
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# ---- Dependencies: install all workspace packages ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
COPY services/worker/package.json services/worker/
COPY services/kb-builder/package.json services/kb-builder/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# ---- Build shared package (all services depend on it) ----
FROM deps AS shared-build
COPY tsconfig.base.json ./
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
COPY packages/shared/tsconfig.cjs.json packages/shared/tsconfig.cjs.json
COPY packages/shared/src/ packages/shared/src/
RUN pnpm --filter @aijourney/shared build

# ---- Seed: create MongoDB indexes ----
FROM shared-build AS seed
COPY scripts/ scripts/
CMD ["pnpm", "run", "seed:db"]

# ---- API: NestJS backend ----
FROM shared-build AS api
COPY services/api/ services/api/
RUN pnpm --filter @aijourney/api build
EXPOSE 3000
CMD ["node", "services/api/dist/main.js"]

# ---- Worker: BullMQ job processors ----
FROM shared-build AS worker
COPY services/worker/ services/worker/
RUN pnpm --filter @aijourney/worker build
CMD ["node", "services/worker/dist/index.js"]

# ---- KB Builder: Express knowledge base pipeline ----
FROM shared-build AS kb-builder
COPY services/kb-builder/ services/kb-builder/
RUN pnpm --filter @aijourney/kb-builder build
EXPOSE 3002
CMD ["node", "services/kb-builder/dist/index.js"]

# ---- Web: build SvelteKit SPA ----
FROM shared-build AS web-build
COPY apps/web/ apps/web/
RUN pnpm --filter @aijourney/web build

# ---- Web: serve with nginx ----
FROM nginx:alpine AS web
COPY --from=web-build /app/apps/web/build /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
