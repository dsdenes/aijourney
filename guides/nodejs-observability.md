# OpenTelemetry-first Observability Suite for Node.js — Agent Implementation Guide

This is a deterministic playbook for GenAI agents to implement a production-grade observability suite (traces, metrics, logs, alerts) for a Node.js service, using OpenTelemetry as the standard. OpenTelemetry provides common semantic conventions, a shared data model, and a vendor-agnostic Collector pipeline. ([OpenTelemetry][1])

---

## 0) Non-negotiable goals

1. **Every request path MUST be traceable end-to-end** across services (including async hops where possible).
2. **Every service MUST expose actionable “golden signal” telemetry**: latency, traffic, errors, saturation. ([sre.google][2])
3. **Every alert MUST map to an SLO/SLI or an explicitly justified risk**, and MUST include a runbook link.
4. **Telemetry MUST NOT take down production** (bounded memory, bounded CPU, bounded network retries, bounded cardinality).
5. **Telemetry MUST follow OpenTelemetry semantic conventions** (resource/service identity, span and attribute vocabulary). ([OpenTelemetry][3])

---

## 1) Target architecture

### 1.1 Canonical pipeline

**Apps (OTLP) → OpenTelemetry Collector (process/enrich/sample/route) → Backends (cloud-native or OSS).**

The Collector is the vendor-agnostic control plane for receiving, processing, and exporting telemetry; it reduces the need to run multiple agents and enables routing to multiple backends. ([OpenTelemetry][1])

### 1.2 Deployment topologies

- **Kubernetes**: per-node DaemonSet Agent (edge) + optional centralized Gateway tier (recommended for tail sampling, heavy processing).
- **VMs**: local agent (systemd) or sidecar.
- **Serverless**: platform distribution (e.g., AWS ADOT for Lambda) or direct OTLP to an endpoint/gateway.

### 1.3 Cloud backends you MUST support (examples included later)

- Amazon Web Services native stack (X-Ray, CloudWatch, AMP, OpenSearch).
- Google Cloud native stack (Cloud Trace/Logging/Monitoring, Managed Prometheus).
- Microsoft Azure native stack (Azure Monitor / Application Insights).

---

## 2) Standards you MUST enforce

### 2.1 Service identity and resource attributes

**Every process MUST set resource attributes** (at minimum):

- `service.name` (stable, unique)
- `service.version` (build/version)
- `deployment.environment.name` (e.g., `prod`, `staging`)
- `service.instance.id` (instance/container id)
- cloud/runtime attributes via resource detection (host, k8s, cloud)

Resource semantic conventions define standard attributes; use them instead of inventing your own keys. ([OpenTelemetry][4])

**Uniqueness rule you MUST respect**: environment does **not** change service identity; the same `service.name` across environments is still the same service identity for many backends—avoid ambiguous naming and use `deployment.environment.name` for environment separation. ([OpenTelemetry][5])

### 2.2 Span naming and attributes

- Span names MUST be **low cardinality** and describe the operation, not the instance.
  - ✅ `HTTP GET /orders/{id}`
  - ❌ `HTTP GET /orders/123456`

- Attributes MUST follow OpenTelemetry semantic conventions (HTTP, DB, messaging, RPC, etc.). ([OpenTelemetry][3])
- Errors MUST be represented via span status and/or exception events (do not rely on log parsing alone).

### 2.3 Metric naming and cardinality rules

- Prefer **semantic convention metrics** when available; otherwise:
  - Metric names SHOULD be `namespace.subsystem.metric` (lowercase, dot-separated).
  - Every metric MUST have a unit and description.

- **High-cardinality dimensions MUST be explicitly approved** (e.g., user id, full URL, order id are usually forbidden).
- Request metrics MUST be aggregatable by `service.name`, `deployment.environment.name`, and route template.

### 2.4 Logs: structure + correlation

- Logs MUST be structured (JSON), not free-form strings.
- Logs SHOULD be emitted via your standard logger (pino/winston/etc.), and MUST include trace correlation fields when a span context exists.
  OpenTelemetry’s log model supports correlation via TraceId and SpanId in log records. ([OpenTelemetry][6])

> Note: the OpenTelemetry logging library for Node.js is still evolving; do not block implementation on “native OTel logs”. Use structured logs + trace/span injection now. ([OpenTelemetry][7])

---

## 3) Node.js instrumentation blueprint (MUST/SHOULD)

### 3.1 Package baseline (MUST)

Use the upstream OpenTelemetry JS SDK:

- `@opentelemetry/sdk-node`
- `@opentelemetry/auto-instrumentations-node`
- OTLP exporters for traces + metrics (HTTP or gRPC)

OpenTelemetry provides a standard OTLP exporter configuration model and environment variables for endpoints/headers/timeouts. ([OpenTelemetry][8])

### 3.2 Bootstrap order (MUST)

Instrumentation MUST start **before** importing instrumented libraries (http, express, pg, redis, grpc, etc.). This is a hard requirement for reliable auto-instrumentation, especially in ESM contexts. ([Microsoft Learn][9])

### 3.3 “In-code” SDK bootstrap (recommended default)

Create `src/telemetry.ts` and import it as the **first import** in your main entrypoint.

```ts
// src/telemetry.ts
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

// Keep SDK diagnostics bounded in prod.
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'my-service',
  [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0',
  'deployment.environment.name': process.env.DEPLOYMENT_ENV ?? 'dev',
});

// OTLP exporter config comes from OTEL_EXPORTER_OTLP_* env vars by default.
const traceExporter = new OTLPTraceExporter();
const metricExporter = new OTLPMetricExporter();

const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    // In prod, prefer 30s–60s; reduce for tests.
    exportIntervalMillis: 60000,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on('SIGTERM', async () => {
  await sdk.shutdown();
});
```

**MUST**: Use OTLP exporters and configure endpoints/headers via standard env vars where possible. ([OpenTelemetry][8])

### 3.4 “Zero-code” option (allowed, but controlled)

You MAY use the official zero-code auto-instrumentation module (best for quick adoption, proofs, and legacy apps). Configuration is via env vars and `--require .../register`. ([OpenTelemetry][10])

Example (OTLP traces exporter):

```bash
export OTEL_TRACES_EXPORTER="otlp"
export OTEL_EXPORTER_OTLP_ENDPOINT="http://otel-collector:4318"
export OTEL_SERVICE_NAME="orders-api"
export OTEL_NODE_RESOURCE_DETECTORS="env,host,os"
export NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register"
node dist/index.js
```

### 3.5 Sampling policy (MUST define explicitly)

You MUST choose and document sampling as a policy, not a default accident.

- **Head sampling in SDK**: simplest; lowest collector complexity.
- **Tail sampling in Collector**: better fidelity (keep “bad traces”), but higher memory/latency cost and requires careful scaling. ([OpenTelemetry][11])

**Default recommendation**:

- Dev/staging: `always_on` (or high ratio).
- Prod: ratio sampling (e.g., 0.05–0.2) + “keep errors” strategy via tail sampling gateway when you can operate it.

---

## 4) Log correlation in Node.js (MUST)

Even if you don’t emit OTel log records directly, you MUST correlate app logs with trace context.

### 4.1 Pino example (trace_id/span_id injection)

```ts
import pino from 'pino';
import { context, trace } from '@opentelemetry/api';

export const logger = pino({
  mixin() {
    const span = trace.getSpan(context.active());
    if (!span) return {};
    const sc = span.spanContext();
    return { trace_id: sc.traceId, span_id: sc.spanId };
  },
});
```

This aligns with the OpenTelemetry log correlation model (TraceId/SpanId). ([OpenTelemetry][6])

### 4.2 Log field schema (MUST standardize)

Every log record MUST include:

- `timestamp` (RFC3339)
- `level` (debug/info/warn/error)
- `msg`
- `service.name`, `deployment.environment.name` (directly or via resource promotion)
- `trace_id`, `span_id` when present
- `error` object fields when applicable: `type`, `message`, `stack`

---

## 5) Collector configuration patterns (MUST)

### 5.1 Security and reliability (MUST)

Collector configs commonly include secrets (tokens, keys, TLS private keys). You MUST:

- store config securely (secret store/encrypted volume),
- enable encryption and authentication on receivers/exporters,
- minimize enabled components to reduce attack surface,
- avoid running Collector as root unless required. ([OpenTelemetry][12])

### 5.2 Baseline pipeline (MUST)

Your baseline Collector MUST support OTLP over gRPC and HTTP:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
      http:

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128

  batch:
    send_batch_size: 8192
    timeout: 5s

exporters:
  otlp:
    endpoint: ${BACKEND_OTLP_ENDPOINT}
    headers:
      authorization: ${BACKEND_OTLP_AUTH}

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp]
```

**MUST**: include `batch` in production pipelines; it is broadly recommended to reduce overhead and improve export efficiency. ([Grafana Labs][13])

### 5.3 Traces → RED metrics via spanmetrics (SHOULD)

To get robust request metrics even when service metric coverage is incomplete, you SHOULD derive RED metrics from spans using the `spanmetrics` connector.

- Connectors bridge pipelines (exporter from one, receiver to another). ([OpenTelemetry][14])
- `spanmetrics` connector exists in collector-contrib and replaces older processor patterns. ([GitHub][15])

Example (conceptual):

```yaml
connectors:
  spanmetrics:

exporters:
  prometheusremotewrite:
    endpoint: ${PROM_REMOTE_WRITE_ENDPOINT}

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [spanmetrics, otlp]
    metrics/spanmetrics:
      receivers: [spanmetrics]
      processors: [memory_limiter, batch]
      exporters: [prometheusremotewrite]
```

---

## 6) Alerting standards (MUST)

### 6.1 Alert types (MUST)

You MUST implement:

1. **SLO burn-rate alerts** (fast + slow burn).
2. **Symptom alerts** (user-visible issues: 5xx rate, p95 latency).
3. **Saturation alerts** (CPU/memory/queue depth approaching limits).
4. **Telemetry pipeline health alerts** (Collector drop rate, export failures).

### 6.2 Burn-rate pattern (MUST)

You MUST implement **two related policies**:

- **Fast burn**: short window, high threshold (catch outages quickly)
- **Slow burn**: long window, lower threshold (catch chronic degradation)

Google’s SLO burn-rate guidance explicitly recommends paired fast/slow policies and gives practical starting thresholds (e.g., 10× baseline for 1–2h lookback and 2× baseline for 24h lookback). ([Google Cloud Documentation][16])

### 6.3 Alert hygiene (MUST)

- Every alert MUST have: description, severity, owner, runbook, dashboard link.
- Alerts MUST be deduplicated and routed (paging vs ticket vs email).
- Alerts SHOULD be based on **rate** and **percentiles**, not raw counts.

---

## 7) Testing & verification (MUST)

### 7.1 Local “telemetry contract” test harness (MUST)

You MUST provide a repeatable local stack:

- Collector (docker)
- Trace backend (e.g., Jaeger/Tempo) **or** OTLP debug exporter
- Metrics backend (Prometheus) **or** OTLP debug exporter
- Log sink (stdout/file) or Loki

### 7.2 Unit tests (SHOULD)

You SHOULD test:

- span creation for key operations,
- mandatory attributes (`service.name`, route template, dependency attributes),
- error spans on failure paths.

### 7.3 Integration tests (MUST)

You MUST run a CI integration test that:

1. starts the service + Collector,
2. executes a known request flow,
3. asserts telemetry was exported (at least one trace with required fields; request metric present; logs include trace_id).

### 7.4 Performance/overhead tests (SHOULD)

You SHOULD measure overhead under load:

- p95 latency delta with telemetry on/off,
- CPU/memory overhead,
- Collector export queue behavior.

Telemetry must remain best-effort; production latency SLOs must not be violated.

---

## 8) Cloud provider reference implementations

Below are “known good” patterns; adapt to your environment (K8s/VM/serverless). The key is: **OTLP from app → Collector → cloud-native backends**.

---

### 8.1 AWS pattern (ADOT → X-Ray/CloudWatch/AMP)

**MUST**: Prefer AWS Distro for OpenTelemetry (ADOT) when you want an AWS-supported distribution. AWS documents ADOT as upstream OTel components tested/optimized/secured/supported by AWS and able to export to X-Ray, CloudWatch, OpenSearch, and Amazon Managed Service for Prometheus. ([AWS Documentation][17])

**Traces**: Collector `awsxray` exporter (converts OTel spans to X-Ray segments). ([GitHub][18])
**Metrics**: either:

- `prometheusremotewrite` to AMP (recommended if you standardize on PromQL/Grafana), or
- CloudWatch EMF exporter (`awsemf`) for CloudWatch metrics. ([GitHub][19])
  **Logs**: `awscloudwatchlogs` exporter (CloudWatch Logs). ([aws-otel.github.io][20])

Minimal example (illustrative component names; validate against your distribution build):

```yaml
receivers:
  otlp:
    protocols: { grpc: {}, http: {} }

processors:
  memory_limiter: { check_interval: 1s, limit_mib: 512, spike_limit_mib: 128 }
  batch: { send_batch_size: 8192, timeout: 5s }

exporters:
  awsxray: {}
  awsemf:
    region: ${AWS_REGION}
  awscloudwatchlogs:
    region: ${AWS_REGION}
    log_group_name: /otel/${DEPLOYMENT_ENV}/app
    log_stream_name: '{service.name}/{service.instance.id}'

service:
  pipelines:
    traces: { receivers: [otlp], processors: [memory_limiter, batch], exporters: [awsxray] }
    metrics: { receivers: [otlp], processors: [memory_limiter, batch], exporters: [awsemf] }
    logs: { receivers: [otlp], processors: [memory_limiter, batch], exporters: [awscloudwatchlogs] }
```

**Alerting**:

- Implement SLO burn-rate alerts using your metrics backend (AMP/CloudWatch).
- Route critical burn alerts to paging; route slow burn to ticketing.

---

### 8.2 Google Cloud pattern (OTLP → Cloud Trace + Managed Prometheus)

**Traces**: Google recommends OTLP ingestion via `telemetry.googleapis.com` for Cloud Trace, especially for high volumes. ([Google Cloud][21])
**Metrics**: Google Cloud Managed Service for Prometheus supports Prometheus and OpenTelemetry metrics without you operating Prometheus at scale. ([Google Cloud Documentation][22])
**Collector**: Google provides guidance for deploying a Google-built Collector to export OTLP logs/metrics/traces into Google Cloud. ([Google Cloud Documentation][23])

Two viable patterns:

#### Pattern A — Direct OTLP traces to telemetry.googleapis.com (traces), metrics to Managed Prometheus

- Traces: app/collector OTLP exporter endpoint → `telemetry.googleapis.com` (OTLP).
- Metrics: Collector uses Google Managed Prometheus exporter or Prometheus remote write (per Google docs).

(Use when you want the lowest moving parts for traces, and PromQL for metrics.)

#### Pattern B — Collector googlecloud exporter (traces+metrics+logs)

- Use the Collector’s Google Cloud exporter to map signals into Cloud Trace/Monitoring/Logging. ([GitHub][24])

Collector skeleton (conceptual):

```yaml
receivers:
  otlp:
    protocols: { grpc: {}, http: {} }

processors:
  memory_limiter: { check_interval: 1s, limit_mib: 512, spike_limit_mib: 128 }
  batch: { send_batch_size: 8192, timeout: 5s }

exporters:
  googlecloud: {} # requires ADC/service account + project

service:
  pipelines:
    traces: { receivers: [otlp], processors: [memory_limiter, batch], exporters: [googlecloud] }
    metrics: { receivers: [otlp], processors: [memory_limiter, batch], exporters: [googlecloud] }
    logs: { receivers: [otlp], processors: [memory_limiter, batch], exporters: [googlecloud] }
```

**Alerting**:

- Burn-rate alerts: implement the paired fast/slow policy per Google’s SLO guidance. ([Google Cloud Documentation][16])

---

### 8.3 Azure pattern (Azure Monitor OpenTelemetry / Application Insights)

You have two clean options:

#### Option A — In-process Azure Monitor OpenTelemetry (simplest)

Microsoft’s Node package `@azure/monitor-opentelemetry` is designed for Azure Monitor and requires `useAzureMonitor()` to run **before any other imports** to avoid telemetry loss. ([Microsoft Learn][9])

```ts
// MUST be the first import in your app
import { useAzureMonitor } from '@azure/monitor-opentelemetry';

useAzureMonitor({
  azureMonitorExporterOptions: {
    connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING!,
  },
});
```

Connection string configuration is supported (environment variable is a standard option). ([Microsoft Learn][25])

#### Option B — Collector azuremonitor exporter (centralized pipeline)

The Collector’s Azure Monitor exporter supports `connection_string` (recommended) for Application Insights. ([GitHub][26])

Collector skeleton:

```yaml
exporters:
  azuremonitor:
    connection_string: ${APPLICATIONINSIGHTS_CONNECTION_STRING}
```

**Alerting**:

- Implement SLO alerts (burn-rate) based on request metrics (either derived via spanmetrics → Prometheus, or emitted directly).
- Add “telemetry health” alerts (exporter errors, drop counts).

---

## 9) Operational hardening (MUST)

### 9.1 PII and secrets (MUST)

- Spans/logs MUST NOT include secrets, auth tokens, full payment details, or sensitive personal identifiers.
- Collector SHOULD scrub sensitive attributes at ingestion if you cannot guarantee app compliance. (Use attribute processors or dedicated scrubbing.)

Collector security best practices explicitly call out scrubbing sensitive data and secure handling of credentials. ([OpenTelemetry][12])

### 9.2 Component governance (MUST)

- You MUST document component stability (Collector is “mixed” stability overall; individual components vary). ([OpenTelemetry][1])
- You MUST pin versions for:
  - OTel JS SDK + instrumentations
  - Collector distribution

- You SHOULD upgrade on a controlled cadence (monthly/quarterly) and rerun telemetry contract tests.

---

## 10) Deterministic implementation checklist (agent-ready)

### Phase A — Foundation (MUST)

- [ ] Add OTel SDK bootstrap (`telemetry.ts`) and ensure it runs before other imports. ([Microsoft Learn][9])
- [ ] Set resource attributes (`service.name`, `service.version`, `deployment.environment.name`). ([OpenTelemetry][4])
- [ ] Export traces+metrics via OTLP to local Collector. ([OpenTelemetry][8])
- [ ] Structured logs with trace_id/span_id injection. ([OpenTelemetry][6])

### Phase B — Collector (MUST)

- [ ] Enable OTLP receiver (grpc+http).
- [ ] Add `memory_limiter` + `batch` processors and place batch after sampling/dropping logic. ([Grafana Labs][13])
- [ ] Secure receiver/exporter channels; store secrets safely; minimize components. ([OpenTelemetry][12])
- [ ] Export to selected backend(s) (AWS/GCP/Azure templates above).

### Phase C — Signals and alerts (MUST)

- [ ] Dashboards: latency p50/p95/p99, RPS, error rate, saturation, top endpoints.
- [ ] SLO burn-rate alerts (fast+slow). ([Google Cloud Documentation][16])
- [ ] Collector health alerts (drop counts, export errors, queue size).

### Phase D — Verification (MUST)

- [ ] CI integration test asserting required telemetry fields exist and export succeeds.
- [ ] Load test overhead budget documented.

---

[1]: https://opentelemetry.io/docs/collector/?utm_source=chatgpt.com 'Collector'
[2]: https://sre.google/sre-book/monitoring-distributed-systems/?utm_source=chatgpt.com 'Chapter 6 - Monitoring Distributed Systems'
[3]: https://opentelemetry.io/docs/concepts/semantic-conventions/?utm_source=chatgpt.com 'Semantic Conventions'
[4]: https://opentelemetry.io/docs/specs/semconv/resource/?utm_source=chatgpt.com 'Resource semantic conventions'
[5]: https://opentelemetry.io/docs/specs/semconv/resource/deployment-environment/ 'Deployment | OpenTelemetry'
[6]: https://opentelemetry.io/docs/specs/otel/logs/ 'OpenTelemetry Logging | OpenTelemetry'
[7]: https://opentelemetry.io/docs/languages/js/getting-started/nodejs/ 'Node.js | OpenTelemetry'
[8]: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/?utm_source=chatgpt.com 'OTLP Exporter Configuration'
[9]: https://learn.microsoft.com/en-us/javascript/api/overview/azure/monitor-opentelemetry-readme?view=azure-node-latest 'Azure Monitor OpenTelemetry for JavaScript | Microsoft Learn'
[10]: https://opentelemetry.io/docs/zero-code/js/ 'JavaScript zero-code instrumentation | OpenTelemetry'
[11]: https://opentelemetry.io/docs/collector/scaling/?utm_source=chatgpt.com 'Scaling the Collector'
[12]: https://opentelemetry.io/docs/security/config-best-practices/ 'Collector configuration best practices | OpenTelemetry'
[13]: https://grafana.com/docs/agent/latest/flow/reference/components/otelcol.processor.batch/?utm_source=chatgpt.com 'otelcol.processor.batch | Grafana Agent documentation'
[14]: https://opentelemetry.io/docs/collector/extend/custom-component/connector/?utm_source=chatgpt.com 'Build a connector'
[15]: https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/connector/spanmetricsconnector/README.md?utm_source=chatgpt.com 'Span Metrics Connector - opentelemetry-collector-contrib'
[16]: https://docs.cloud.google.com/stackdriver/docs/solutions/slo-monitoring/alerting-on-budget-burn-rate 'Alerting on your burn rate  |  Google Cloud Observability  |  Google Cloud Documentation'
[17]: https://docs.aws.amazon.com/xray/latest/devguide/xray-services-adot.html 'AWS Distro for OpenTelemetry and AWS X-Ray - AWS X-Ray'
[18]: https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/exporter/awsxrayexporter/README.md?utm_source=chatgpt.com 'AWS X-Ray Tracing Exporter'
[19]: https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/exporter/awsemfexporter/README.md?utm_source=chatgpt.com 'README.md - AWS CloudWatch EMF Exporter'
[20]: https://aws-otel.github.io/docs/getting-started/adot-eks-add-on/config-container-logs?utm_source=chatgpt.com 'Container Logs Collector Configuration'
[21]: https://cloud.google.com/blog/products/management-tools/opentelemetry-now-in-google-cloud-observability 'OpenTelemetry now in Google Cloud Observability | Google Cloud Blog'
[22]: https://docs.cloud.google.com/stackdriver/docs/managed-prometheus?utm_source=chatgpt.com 'Google Cloud Managed Service for Prometheus'
[23]: https://docs.cloud.google.com/stackdriver/docs/instrumentation/opentelemetry-collector-gce?utm_source=chatgpt.com 'Deploy Google-Built OpenTelemetry Collector on Compute ...'
[24]: https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/exporter/googlecloudexporter/README.md?utm_source=chatgpt.com 'Google Cloud Exporter - opentelemetry-collector-contrib'
[25]: https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-configuration?utm_source=chatgpt.com 'Configure Azure Monitor OpenTelemetry'
[26]: https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/exporter/azuremonitorexporter/README.md?utm_source=chatgpt.com 'Azure Monitor Exporter - opentelemetry-collector-contrib'
