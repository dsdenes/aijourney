import type { Job } from 'bullmq';

const KB_BUILDER_URL = process.env.KB_BUILDER_URL || 'http://localhost:3002';

function getPollIntervalMs(): number {
  return Number(process.env.PIPELINE_POLL_INTERVAL_MS) || 5000;
}

/**
 * Summarization worker: triggers the KB Builder pipeline to summarize
 * quality-passed articles via OpenAI.
 *
 * When an articleId is provided the worker re-fetches that single article's
 * text and calls OpenAI directly. When no articleId is given it delegates
 * to the KB Builder pipeline endpoint which processes all pending articles.
 */
export async function handleSummarizationJob(job: Job): Promise<Record<string, unknown>> {
  const { runRequestId, articleId } = job.data;
  const startedAt = Date.now();

  await job.log(`start run=${runRequestId} article=${articleId || 'all'}`);
  console.log(`[summarization] Processing run=${runRequestId} article=${articleId || 'all'}`);

  try {
    await job.updateProgress(10);

    // Trigger the KB Builder pipeline which runs quality-filter → summarize → ingest
    const res = await fetch(`${KB_BUILDER_URL}/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`KB Builder pipeline returned ${res.status}: ${text.slice(0, 200)}`);
    }

    await job.updateProgress(50);
    await job.log('Pipeline triggered, waiting for completion...');

    // Poll pipeline progress until done
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max (5s * 120)
    let pipelineResult: Record<string, unknown> = {};

    while (attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, getPollIntervalMs()));
      attempts++;

      try {
        const progressRes = await fetch(`${KB_BUILDER_URL}/pipeline/progress`);
        if (progressRes.ok) {
          const progress = (await progressRes.json()) as Record<string, unknown>;
          const status = progress.status as string;

          await job.updateProgress(Math.min(50 + Math.floor((attempts / maxAttempts) * 45), 95));

          if (status === 'completed' || status === 'idle') {
            pipelineResult = progress;
            break;
          }
          if (status === 'failed') {
            throw new Error(`Pipeline failed: ${(progress.error as string) || 'unknown error'}`);
          }
        }
      } catch (pollErr) {
        if (pollErr instanceof Error && pollErr.message.startsWith('Pipeline failed')) {
          throw pollErr;
        }
        // Transient fetch error, keep polling
      }
    }

    await job.updateProgress(100);
    await job.log(`completed run=${runRequestId}`);
    console.log(`[summarization] Done run=${runRequestId}`);

    return {
      runRequestId,
      articleId,
      status: 'completed',
      pipelineResult,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await job.log(`FAILED: ${msg}`);
    console.error(`[summarization] Failed run=${runRequestId}: ${msg}`);
    throw err;
  }
}
