# Threat Model Summary

## Assets

- User identity and tenant membership
- Company context documents and extracted facts
- LLM prompts, responses, and usage metadata
- Billing and quota state
- Operational secrets in GitHub Actions and runtime `.env`

## Main Threats

### Authentication misconfiguration

- Risk: production fallback to insecure dev auth behavior
- Mitigation: production config validation now requires OAuth and OpenAI configuration at startup

### Cross-tenant data access

- Risk: tenant context or authorization mistakes expose another tenant's data
- Mitigation: tenant context middleware and server-side repository checks must remain enforced on all tenant-scoped endpoints

### Secret leakage

- Risk: credentials or API keys committed or logged
- Mitigation: keep secrets in GitHub Actions secrets and runtime env only; never log raw secrets; keep `.env` out of git

### Dependency outage

- Risk: MongoDB, Redis, or KB Builder outages break core flows
- Mitigation: readiness endpoint now exposes dependency state for rapid detection and controlled rollback

### Resource exhaustion

- Risk: polling storms, queue buildup, or expensive LLM calls degrade service
- Mitigation: reduced frontend polling, queue monitoring, rate limits, and production alerts on backlog/error growth

## Residual Risks

- No full OTel tracing pipeline is configured yet
- No staged rollout or canary deployment exists yet
- Worker liveness is container-based rather than endpoint-based

These residual risks should be tracked as next-phase improvements rather than blocking the current production baseline.
