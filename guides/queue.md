## Queueing in Node.js for GenAI agents (BullMQ-first)

### 0) Non-negotiable queueing semantics

* Your system MUST assume **at-least-once** processing (duplicates can happen) and MUST make every consumer **idempotent**.
* Your system MUST treat the queue as an **availability boundary**: producers enqueue and return; workers execute asynchronously.
* Your system SHOULD separate “background jobs” (task queue) from “domain events” (pub/sub) unless you have a strong reason to unify them.

---

## 1) Default baseline: BullMQ architecture

### 1.1 Core components you MUST use (BullMQ)

* **Queue**: producers add jobs.
* **Worker**: consumers process jobs.
* **QueueScheduler**: you MUST run one per queue namespace to (a) move delayed jobs into `wait` and (b) detect stalled jobs. ([docs.bullmq.io][1])
* **QueueEvents**: you SHOULD subscribe to job lifecycle events for observability and automation (DLQ routing, alerts).
* **FlowProducer**: you SHOULD use flows for job dependency trees (parent waits for children). ([docs.bullmq.io][2])

### 1.2 Redis requirements (BullMQ depends on this)

Your Redis deployment MUST be “queue-safe”, not “cache-safe”:

* Persistence MUST be configured (BullMQ recommends AOF). ([docs.bullmq.io][3])
* `maxmemory-policy` MUST be `noeviction` (any eviction can corrupt queue state). ([docs.bullmq.io][3])
* Producers and workers MUST use resilient connection behavior:

  * Queue clients SHOULD fail fast on Redis outage.
  * Workers SHOULD wait indefinitely and recover automatically. ([docs.bullmq.io][3])

---

## 2) Job contract and naming

### 2.1 Job identity, versioning, and idempotency

* Every job payload MUST include:

  * `jobKey` (business idempotency key; stable across retries)
  * `schemaVersion`
  * `correlationId` (request/session id)
  * `traceparent` (if you propagate W3C trace context)
* Producers SHOULD set `jobId` to a deterministic value (e.g., `jobKey`) when you want deduplication-at-enqueue.
* Workers MUST implement idempotency at the side-effect boundary (DB write, email send, external API call), not just at enqueue.

### 2.2 Payload sizing

* Jobs MUST NOT carry large blobs (documents, images, huge prompts).
* Jobs SHOULD carry **references** (object storage URL/key + hash) and fetch/stream content in the worker.

---

## 3) BullMQ implementation blueprint (TypeScript)

### 3.1 Producer

```ts
import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL!, {
  // Queue-side SHOULD fail fast when Redis is down:
  enableOfflineQueue: false,
  maxRetriesPerRequest: 3,
});

export const emailQueue = new Queue("email", {
  connection,
  defaultJobOptions: {
    attempts: 8,
    backoff: { type: "exponential", delay: 1_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: false, // keep for investigation / manual retry
  },
});

export type SendEmailJob = {
  schemaVersion: 1;
  jobKey: string;
  correlationId: string;
  to: string;
  templateId: string;
  params: Record<string, unknown>;
};

export async function enqueueSendEmail(payload: SendEmailJob) {
  // jobId SHOULD be deterministic when dedupe is desired
  const jobId = payload.jobKey;

  await emailQueue.add("send-email.v1", payload, {
    jobId,
    // delay, priority, etc. optional per use-case
  });
}
```

### 3.2 Worker + QueueScheduler (MUST)

```ts
import { Worker, QueueScheduler, QueueEvents, Job } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL!, {
  // Worker MUST tolerate transient Redis issues:
  maxRetriesPerRequest: null,
});

new QueueScheduler("email", { connection }); // MUST run for delayed + stalled recovery :contentReference[oaicite:6]{index=6}

const queueEvents = new QueueEvents("email", { connection });

queueEvents.on("failed", ({ jobId, failedReason }) => {
  // SHOULD emit structured logs + metrics + alert signals
  console.error({ jobId, failedReason }, "job failed");
});

async function processSendEmail(job: Job) {
  const data = job.data as any;

  // MUST: idempotency gate (example sketch)
  // - check "already processed" in DB using data.jobKey
  // - if processed => return
  // - else perform side effect + mark processed (transactional if possible)

  // ... send email ...
}

export const worker = new Worker(
  "email",
  async (job) => {
    if (job.name !== "send-email.v1") throw new Error("Unknown job type");
    return processSendEmail(job);
  },
  {
    connection,
    concurrency: 20, // controls parallelism per worker instance :contentReference[oaicite:7]{index=7}
    limiter: { max: 50, duration: 1000 }, // SHOULD apply global-ish rate limiting :contentReference[oaicite:8]{index=8}
  }
);

// MUST log errors to avoid “unhandled errors” in prod :contentReference[oaicite:9]{index=9}
worker.on("error", (err) => console.error({ err }, "worker error"));

// MUST gracefully shut down to reduce stalled jobs :contentReference[oaicite:10]{index=10}
async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down...`);
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
```

### 3.3 Stalled-job avoidance

* Workers MUST avoid CPU-blocking work on the Node event loop; otherwise jobs can be marked stalled. ([docs.bullmq.io][4])
* CPU-heavy tasks SHOULD be executed via:

  * BullMQ sandboxed processors, OR
  * a separate worker process/service (recommended for predictable isolation).

### 3.4 Scheduling / repeatable jobs

* For recurring work, you SHOULD use BullMQ **Job Schedulers** (repeatable-job APIs were deprecated in favor of Job Schedulers in newer BullMQ versions). ([docs.bullmq.io][5])

### 3.5 Dependencies / workflows

* Multi-step pipelines SHOULD use flows (parent waits until children complete). ([docs.bullmq.io][2])

---

## 4) Failure handling and “DLQ” in BullMQ

BullMQ doesn’t have a single “DLQ queue” primitive like cloud brokers; you implement the equivalent with policy + automation:

* You MUST set `attempts` + `backoff` for transient failures.
* You MUST classify failures:

  * **Transient** (timeouts, 429/503) → retry with backoff.
  * **Permanent** (schema invalid, missing entity) → fail fast and route to manual handling.
* You SHOULD keep failed jobs (`removeOnFail: false`) for inspection and manual retry. ([docs.bullmq.io][3])
* You SHOULD implement a “dead-letter queue” pattern by:

  * listening to `failed` events and
  * moving/copying terminally failed jobs into a separate `dead-letter` queue with full context.

---

## 5) When to choose a different queue solution

### 5.1 Decision rules

* You SHOULD choose **BullMQ** when:

  * you need **in-app background jobs** (emails, media transforms, LLM calls),
  * you need **delays**, retries, job dependencies, and you can operate Redis safely.
* You SHOULD choose a **managed cloud queue** when:

  * you want operational simplicity, cross-service integration, and durability without running Redis yourself.
* You SHOULD choose a **stream/event log** (Kafka-class) when:

  * you need replay, long retention, multiple independent consumer groups, and high-throughput event ingestion.

### 5.2 Quick comparison (practical)

* **BullMQ**: best task-queue ergonomics in Node; requires Redis configured with persistence + `noeviction`. ([docs.bullmq.io][3])
* **SQS**: durable managed queue; classic at-least-once; visibility timeout + DLQ patterns. ([AWS Documentation][6])
* **Pub/Sub**: event distribution; supports ordering keys; DLQ forwarding is best-effort; has an exactly-once delivery feature (service-specific constraints apply). ([Google Cloud Documentation][7])
* **Service Bus**: enterprise messaging; peek-lock, lock renewal, DLQ on max delivery count. ([Microsoft Learn][8])
* **Cloud Tasks** (GCP): choose when you need tight control over execution timing of a specific HTTP/RPC target (vs Pub/Sub for event distribution). ([Google Cloud Documentation][9])

---

## 6) Cloud provider guides and examples

### 6.1 BullMQ deployment pattern (same shape everywhere)

* You MUST run Redis with:

  * persistence enabled and
  * `maxmemory-policy=noeviction`. ([docs.bullmq.io][3])
* Workers MUST be horizontally scalable (N replicas) and stateless.
* You SHOULD run **1 QueueScheduler per queue name** (can be a small singleton deployment). ([docs.bullmq.io][1])
* You SHOULD isolate the Redis used for queues from “shared cache Redis” to avoid eviction/policy conflicts.

### 6.2 Amazon Web Services

**If using native AWS queueing (SQS)**

* Consumers MUST set **visibility timeout** long enough for processing; if you don’t delete before it expires, messages reappear. ([AWS Documentation][6])
* You SHOULD enable **long polling** (`WaitTimeSeconds` up to 20s) to reduce empty receives and cost. ([AWS Documentation][10])
* You MUST configure a **DLQ** with a redrive policy; DLQ retention SHOULD exceed source retention. ([AWS Documentation][11])
* You SHOULD batch operations (up to 10 messages per API call) to reduce cost and raise throughput. ([AWS Documentation][12])

Minimal Node.js example (AWS SDK v3):

```ts
import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({ region: process.env.AWS_REGION });
const QueueUrl = process.env.SQS_URL!;

export async function send(payload: object) {
  await sqs.send(new SendMessageCommand({ QueueUrl, MessageBody: JSON.stringify(payload) }));
}

export async function pollOnce() {
  const res = await sqs.send(new ReceiveMessageCommand({
    QueueUrl,
    WaitTimeSeconds: 20,        // long polling
    MaxNumberOfMessages: 10,    // batching
    VisibilityTimeout: 60,      // match your processing time
  }));
  for (const m of res.Messages ?? []) {
    try {
      const body = JSON.parse(m.Body!);
      // MUST be idempotent
      // ...process...
      await sqs.send(new DeleteMessageCommand({ QueueUrl, ReceiptHandle: m.ReceiptHandle! }));
    } catch (e) {
      // do NOT delete => retry after visibility timeout
      console.error(e);
    }
  }
}
```

### 6.3 Google Cloud

**If using native GCP queueing**

* Pub/Sub ordering:

  * If you use ordering keys, consumers MUST ack promptly; slow/unacked messages can delay delivery. ([Google Cloud Documentation][7])
* Dead-letter topics:

  * DLQ forwarding is best-effort; you MUST design for variability in forwarding attempts. ([Google Cloud Documentation][13])
* Choosing Cloud Tasks vs Pub/Sub:

  * Cloud Tasks SHOULD be used when you must control execution timing of an HTTP/RPC target; Pub/Sub for general event distribution. ([Google Cloud Documentation][9])

Minimal Pub/Sub example:

```ts
import { PubSub } from "@google-cloud/pubsub";

const pubsub = new PubSub();
const topicName = process.env.PUBSUB_TOPIC!;
const subscriptionName = process.env.PUBSUB_SUBSCRIPTION!;

export async function publish(payload: object) {
  const data = Buffer.from(JSON.stringify(payload));
  await pubsub.topic(topicName).publishMessage({ data });
}

export function subscribe() {
  const sub = pubsub.subscription(subscriptionName);
  sub.on("message", async (message) => {
    try {
      const body = JSON.parse(message.data.toString("utf8"));
      // MUST be idempotent
      // ...process...
      message.ack();
    } catch (e) {
      // nack => redelivery
      console.error(e);
      message.nack();
    }
  });
}
```

### 6.4 Microsoft Azure

**If using native Azure queueing (Service Bus)**

* In peek-lock mode, you MUST complete messages explicitly; otherwise lock expiry increments delivery count.
* Messages exceeding `MaxDeliveryCount` are moved to the **DLQ** (default is 10). ([Microsoft Learn][8])
* You MUST size **lock duration** to processing time (default 1 minute) and renew locks for long handlers. ([Microsoft Learn][14])

Minimal Service Bus example:

```ts
import { ServiceBusClient } from "@azure/service-bus";

const sb = new ServiceBusClient(process.env.SB_CONNECTION_STRING!);
const queueName = process.env.SB_QUEUE!;

export async function send(payload: object) {
  const sender = sb.createSender(queueName);
  await sender.sendMessages({ body: payload });
  await sender.close();
}

export async function receive() {
  const receiver = sb.createReceiver(queueName, { receiveMode: "peekLock" });
  receiver.subscribe({
    processMessage: async (msg) => {
      try {
        // MUST be idempotent
        // ...process msg.body...
        await receiver.completeMessage(msg);
      } catch (e) {
        console.error(e);
        await receiver.abandonMessage(msg); // increments delivery count
      }
    },
    processError: async (args) => console.error(args.error),
  });
}
```

---

## 7) How to test a queueing solution (what “done” looks like)

### 7.1 Unit tests (fast)

* Worker business logic MUST be testable as a pure function (input payload → side-effect calls).
* Idempotency MUST be unit-tested:

  * first run performs side effect
  * second run (same `jobKey`) performs no side effect

### 7.2 Integration tests (real broker)

**BullMQ**

* You SHOULD run a real Redis in CI (container) and run:

  * enqueue → processed → completed
  * transient failure → retries obey backoff
  * delayed job → becomes runnable (requires QueueScheduler) ([docs.bullmq.io][1])
  * kill worker mid-job → stalled recovery works ([docs.bullmq.io][1])

**AWS SQS**

* You SHOULD use LocalStack to test SQS integration locally. ([Docs][15])

**GCP Pub/Sub**

* You SHOULD use the official Pub/Sub emulator for local/CI tests. ([Google Cloud Documentation][16])

**Azure Service Bus**

* You SHOULD use the Azure Service Bus emulator (Docker) for local/CI tests. ([Microsoft Learn][17])

### 7.3 Failure-mode tests (must-have)

Your test suite MUST include:

* Duplicate delivery: same message/job processed twice → consistent outcome.
* Poison message: invalid payload → routed to terminal failure path quickly.
* Backpressure: downstream 429/503 → retries with bounded concurrency + rate limiting. ([docs.bullmq.io][18])
* Broker outage: Redis/SQS/PubSub/ServiceBus temporarily unavailable → system recovers without manual intervention (workers wait; producers fail fast where appropriate). ([docs.bullmq.io][3])

### 7.4 Load / soak tests

* You SHOULD run a sustained enqueue+process test that validates:

  * p95/p99 queue latency
  * worker throughput
  * memory growth (job retention settings)
  * no key eviction (BullMQ requires `noeviction`). ([docs.bullmq.io][3])

---

## 8) Production readiness checklist (BullMQ default)

* Redis persistence MUST be enabled; `maxmemory-policy` MUST be `noeviction`. ([docs.bullmq.io][3])
* QueueScheduler MUST be running for every queue with delayed jobs and for stalled detection. ([docs.bullmq.io][1])
* Workers MUST shut down gracefully on SIGINT/SIGTERM. ([docs.bullmq.io][3])
* Job payloads MUST be versioned and consumers MUST be idempotent.
* Retries/backoff MUST be configured; terminal failures MUST be observable and actionable (DLQ equivalent).
* Concurrency and rate limiting SHOULD be configured per downstream dependency. ([docs.bullmq.io][19])
* Sensitive data MUST NOT be stored in job payloads; if unavoidable, it MUST be encrypted before enqueue. ([docs.bullmq.io][3])

[1]: https://docs.bullmq.io/guide/queuescheduler?utm_source=chatgpt.com "QueueScheduler"
[2]: https://docs.bullmq.io/guide/flows?utm_source=chatgpt.com "Flows"
[3]: https://docs.bullmq.io/guide/going-to-production "Going to production | BullMQ"
[4]: https://docs.bullmq.io/guide/jobs/stalled?utm_source=chatgpt.com "Stalled"
[5]: https://docs.bullmq.io/guide/jobs/repeatable?utm_source=chatgpt.com "Repeatable"
[6]: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html?utm_source=chatgpt.com "Amazon SQS visibility timeout"
[7]: https://docs.cloud.google.com/pubsub/docs/ordering?utm_source=chatgpt.com "Order messages | Pub/Sub"
[8]: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues?utm_source=chatgpt.com "Service Bus dead-letter queues - Azure"
[9]: https://docs.cloud.google.com/pubsub/docs/choosing-pubsub-or-cloud-tasks?utm_source=chatgpt.com "Choosing Pub/Sub or Cloud Tasks"
[10]: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html?utm_source=chatgpt.com "Amazon SQS short and long polling - AWS Documentation"
[11]: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html?utm_source=chatgpt.com "Using dead-letter queues in Amazon SQS"
[12]: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-batch-api-actions.html?utm_source=chatgpt.com "Amazon SQS batch actions - Amazon Simple Queue Service"
[13]: https://docs.cloud.google.com/pubsub/docs/dead-letter-topics?utm_source=chatgpt.com "Dead-letter topics | Pub/Sub"
[14]: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-transfers-locks-settlement?utm_source=chatgpt.com "Message Transfers, Locks, and Settlement - Azure"
[15]: https://docs.localstack.cloud/aws/integrations/aws-sdks/?utm_source=chatgpt.com "How to connect with AWS SDKs?"
[16]: https://docs.cloud.google.com/pubsub/docs/emulator?utm_source=chatgpt.com "Testing apps locally with the emulator | Pub/Sub"
[17]: https://learn.microsoft.com/en-us/azure/service-bus-messaging/test-locally-with-service-bus-emulator?utm_source=chatgpt.com "Test locally by using the Azure Service Bus emulator"
[18]: https://docs.bullmq.io/guide/rate-limiting?utm_source=chatgpt.com "Rate limiting"
[19]: https://docs.bullmq.io/guide/workers/concurrency?utm_source=chatgpt.com "Concurrency"
