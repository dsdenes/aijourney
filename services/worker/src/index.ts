import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import { handleKbChatJob } from './workers/kb-chat.worker.js';
import { handlePersonalizationJob } from './workers/personalization.worker.js';
import { handleSummarizationJob } from './workers/summarization.worker.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const url = new URL(REDIS_URL);

const connection = {
  host: url.hostname,
  port: Number(url.port) || 6379,
  ...(url.password && { password: url.password }),
};

console.log('[worker] Connecting to Redis:', `${url.hostname}:${url.port || 6379}`);

// Define queues
export const summarizationQueue = new Queue('summarization', { connection });
export const personalizationQueue = new Queue('personalization', {
  connection,
});
export const kbChatQueue = new Queue('kb-chat', { connection });

// Feature flag — set ENABLE_PERSONALIZATION_WORKER=true to activate
const personalizationEnabled = process.env.ENABLE_PERSONALIZATION_WORKER === 'true';

if (!personalizationEnabled) {
  console.log(
    '[worker] Personalization worker DISABLED (set ENABLE_PERSONALIZATION_WORKER=true to enable)',
  );
}

// Create workers
const summarizationWorker = new Worker('summarization', handleSummarizationJob, {
  connection,
  concurrency: 2,
});

const personalizationWorker = personalizationEnabled
  ? new Worker('personalization', handlePersonalizationJob, {
      connection,
      concurrency: 2,
    })
  : null;

const kbChatWorker = new Worker('kb-chat', handleKbChatJob, {
  connection,
  concurrency: 3,
});

// Event handlers
const activeWorkers: Record<string, Worker> = {
  summarization: summarizationWorker,
  'kb-chat': kbChatWorker,
  ...(personalizationWorker && { personalization: personalizationWorker }),
};

for (const [name, worker] of Object.entries(activeWorkers)) {
  worker.on('completed', (job) => {
    console.log(`[${name}] Job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[${name}] Job ${job?.id} failed:`, err.message);
  });
  worker.on('active', (job) => {
    console.log(`[${name}] Job ${job.id} active`);
  });
}

// Graceful shutdown
const shutdown = async () => {
  console.log('[worker] Shutting down...');
  await Promise.all([
    summarizationWorker.close(),
    personalizationWorker?.close(),
    kbChatWorker.close(),
  ]);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[worker] All workers started. Waiting for jobs...');
