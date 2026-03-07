# Monitoring And Alerting Specification

## Service-Level Checks

### API

- Liveness: `GET /api/health/live`
- Readiness: `GET /api/health/ready`
- Alert when readiness is non-`200` for 2 consecutive minutes.

### KB Builder

- Health: `GET /health`
- Alert when non-`200` for 2 consecutive minutes.

### Worker

- Alert when the container exits or restarts repeatedly.
- Alert when BullMQ active jobs stay zero while waiting backlog grows beyond threshold.

## Recommended Alerts

- API readiness failed
- MongoDB dependency down in readiness report
- Redis dependency down in readiness report
- KB Builder dependency down in readiness report
- CI deploy failure on `main`
- BullMQ failed job rate spike
- Queue backlog sustained above normal operating threshold
- Host disk space low for Docker volumes and backups

## Runbook Links

- Operations: `docs/runbooks/production-operations.md`
- Backup/restore: `docs/runbooks/backup-restore.md`

## Dashboard Minimums

- Deployment status by commit SHA
- API readiness history
- API 5xx rate and p95 latency
- MongoDB and Redis container health
- Queue depth per BullMQ queue
- KB Builder crawl/pipeline status

## Logging Requirements

- Capture `x-request-id` and `x-flow-id`
- Retain stack traces for server errors
- Include request method and path in error logs
- Preserve deploy logs from GitHub Actions for auditability
