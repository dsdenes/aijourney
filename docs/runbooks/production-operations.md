# Production Operations Runbook

## Scope

This runbook covers the production deployment running from `docker-compose.server.yml` on the Scaleway host behind `https://ai.1p.hu`.

Services:

- `web`: Svelte frontend served by nginx
- `api`: NestJS backend on port `3000`
- `worker`: BullMQ worker process
- `kb-builder`: Express knowledge-base pipeline on port `3002`
- `mongodb`: MongoDB primary datastore
- `redis`: BullMQ/cache backing store

## Ownership And On-Call

- Primary owner: repository owner / platform maintainer
- Business-hours on-call expectation: monitor deploy failures, health regressions, auth failures, and queue backlogs
- Escalation path: infrastructure owner for host/runtime issues, application owner for code regressions, provider owner for third-party outages

## Golden Signals

- Availability: `GET /api/health/live` and `GET /api/health/ready`
- Error rate: API `5xx` responses and failed BullMQ jobs
- Latency: API p95 on user-facing endpoints, especially auth, chat, journeys, and billing flows
- Saturation: MongoDB connectivity, Redis connectivity, queue backlog, memory pressure in `kb-builder`

## Standard Checks

1. Confirm the latest GitHub Actions `CI` run on `main` succeeded.
2. Confirm `docker compose -f docker-compose.server.yml ps` shows all critical services up.
3. Confirm `curl -fsS http://localhost:3000/api/health/ready` returns HTTP `200`.
4. Confirm `curl -fsS http://localhost:3002/health` returns HTTP `200`.
5. Confirm the web app loads and the login screen or authenticated app shell renders.

## Incident Triage

### API not ready

1. Check `curl -i http://localhost:3000/api/health/ready`.
2. Inspect the `checks` object in the response.
3. If `mongodb` is down, inspect MongoDB container logs and health status.
4. If `redis` is down, inspect Redis container logs and queue connectivity.
5. If `kbBuilder` is down, inspect the `kb-builder` container and decide whether degraded mode is acceptable.

### Deploy failed in CI

1. Open the latest GitHub Actions run.
2. Check `lint`, `test-*`, and `build-check` before checking `deploy`.
3. If only `deploy` failed, inspect the step logs for compose config, image build, restart, migrations, and readiness verification.
4. If the new revision is bad, redeploy the previous known-good commit through GitHub Actions.

### Queue backlog or stuck jobs

1. Open the worker monitoring UI pages in the admin app.
2. Check Redis availability and queue depth.
3. Inspect `worker` logs for repeated failures.
4. If a specific worker is failing due to dependency issues, pause the queue through the admin UI or by operational command.

## Rollback

1. Identify the last green commit on `main`.
2. Re-run deployment from that commit by pushing a revert or redeploying the known-good SHA through GitHub Actions.
3. Verify `api/health/ready` after rollback.
4. Record the failed commit SHA, blast radius, and recovery notes.
