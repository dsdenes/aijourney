# Production Readiness Checklist

## Status

The repository now has a production baseline suitable for controlled public operation on the current single-host deployment model.

Implemented baseline:

- strict production startup validation for core auth and LLM configuration
- request correlation via `x-request-id` and `x-flow-id`
- separate liveness and readiness endpoints for the API
- readiness checks for MongoDB, Redis, and KB Builder
- graceful API shutdown hooks
- deploy verification against readiness instead of a shallow health check
- blocking CI lint step
- production runbook, backup/restore procedure, threat model, monitoring spec, and dependency map

## Required Artifact Links

- Operations runbook: `docs/runbooks/production-operations.md`
- Backup and restore: `docs/runbooks/backup-restore.md`
- Monitoring and alerting: `docs/production/monitoring-alerting.md`
- Threat model: `docs/production/threat-model.md`
- Dependency and degradation map: `docs/production/dependency-map.md`

## Remaining Non-Blocking Gaps

- No staged rollout or canary deployment yet
- No centralized tracing backend or OpenTelemetry collector yet
- Worker health is process/container based rather than HTTP probe based
- Backup automation and restore drill cadence still require operational follow-through

These are next-phase improvements, not blockers for the current production baseline.
