<script lang="ts">
  import { api } from '$lib/api';
  import { onMount } from 'svelte';

  interface Props {
    slug: string;
    isStandaloneService?: boolean;
  }

  interface WorkerDef {
    name: string;
    slug: string;
    description: string;
    queueName: string;
    concurrency: number;
    defaultJobData: Record<string, unknown>;
    stats: QueueStats | null;
    kbBuilderStatus: Record<string, unknown> | null;
  }

  interface QueueStats {
    name: string;
    slug: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
  }

  interface JobInfo {
    id: string;
    name: string;
    data: Record<string, unknown>;
    status: string;
    progress: number | object;
    attemptsMade: number;
    processedOn: number | undefined;
    finishedOn: number | undefined;
    failedReason: string | undefined;
    returnvalue: unknown;
    timestamp: number;
    duration: number | undefined;
  }

  let { slug, isStandaloneService = false }: Props = $props();

  let worker = $state<WorkerDef | null>(null);
  let jobs = $state<JobInfo[]>([]);
  let loading = $state(true);
  let error = $state('');
  let jobFilter = $state<'completed' | 'failed' | 'waiting' | 'active' | 'delayed'>('completed');
  let expandedJobId = $state<string | null>(null);
  let jobLogs = $state<Record<string, string[]>>({});
  let triggerData = $state('{}');
  let triggerLoading = $state(false);
  let triggerResult = $state<string | null>(null);
  let actionLoading = $state('');
  let autoRefresh = $state(false);
  let refreshInterval: ReturnType<typeof setInterval> | undefined;

  async function loadWorker() {
    try {
      const res = await api.get<WorkerDef>(`/workers/${slug}`);
      worker = res.data || null;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load worker';
    }
  }

  async function loadJobs() {
    try {
      const res = await api.get<JobInfo[]>(`/workers/${slug}/jobs?status=${jobFilter}&start=0&end=49`);
      jobs = res.data || [];
    } catch {
      jobs = [];
    }
  }

  async function loadAll() {
    loading = true;
    await Promise.all([loadWorker(), isStandaloneService ? Promise.resolve() : loadJobs()]);
    loading = false;
  }

  onMount(() => {
    loadAll();

    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  });

  $effect(() => {
    if (!isStandaloneService) {
      loadJobs();
    }
  });

  $effect(() => {
    if (refreshInterval) clearInterval(refreshInterval);
    if (autoRefresh) {
      refreshInterval = setInterval(() => {
        loadWorker();
        if (!isStandaloneService) loadJobs();
      }, 3000);
    }
  });

  async function triggerJob() {
    triggerLoading = true;
    triggerResult = null;
    try {
      let data: Record<string, unknown> = {};
      if (triggerData.trim()) {
        data = JSON.parse(triggerData);
      }
      const res = await api.post<Record<string, unknown>>(`/workers/${slug}/trigger`, data);
      triggerResult = JSON.stringify(res.data, null, 2);
      // Refresh stats after trigger
      setTimeout(() => { loadWorker(); loadJobs(); }, 1000);
    } catch (err) {
      triggerResult = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
    } finally {
      triggerLoading = false;
    }
  }

  async function pauseQueue() {
    actionLoading = 'pause';
    try {
      await api.post(`/workers/${slug}/pause`);
      await loadWorker();
    } finally {
      actionLoading = '';
    }
  }

  async function resumeQueue() {
    actionLoading = 'resume';
    try {
      await api.post(`/workers/${slug}/resume`);
      await loadWorker();
    } finally {
      actionLoading = '';
    }
  }

  async function cleanJobs(status: 'completed' | 'failed') {
    actionLoading = `clean-${status}`;
    try {
      await api.delete(`/workers/${slug}/clean/${status}`);
      await loadJobs();
      await loadWorker();
    } finally {
      actionLoading = '';
    }
  }

  async function retryFailed() {
    actionLoading = 'retry';
    try {
      await api.post(`/workers/${slug}/retry`);
      await loadJobs();
      await loadWorker();
    } finally {
      actionLoading = '';
    }
  }

  async function toggleExpandJob(jobId: string) {
    if (expandedJobId === jobId) {
      expandedJobId = null;
      return;
    }
    expandedJobId = jobId;
    if (!jobLogs[jobId]) {
      try {
        const res = await api.get<{ logs: string[]; count: number }>(`/workers/${slug}/jobs/${jobId}/logs`);
        jobLogs[jobId] = res.data?.logs || [];
      } catch {
        jobLogs[jobId] = ['(Failed to fetch logs)'];
      }
    }
  }

  function formatTimestamp(ts: number | undefined): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleString();
  }

  function formatDuration(ms: number | undefined): string {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  const statusColors: Record<string, string> = {
    waiting: 'bg-yellow-500/20 text-yellow-300',
    active: 'bg-cyan-500/20 text-cyan-300',
    completed: 'bg-green-500/20 text-green-300',
    failed: 'bg-red-500/20 text-red-300',
    delayed: 'bg-orange-500/20 text-orange-300',
  };
</script>

{#if loading}
  <div class="flex items-center justify-center py-12">
    <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
  </div>
{:else if error}
  <div class="rounded-lg bg-red-900/30 p-4 text-red-200">{error}</div>
{:else if worker}
  <!-- Header + auto-refresh -->
  <div class="mb-5 flex items-start justify-between">
    <div>
      <h2 class="text-lg font-semibold text-text">{worker.name}</h2>
      <p class="mt-1 max-w-2xl text-sm text-text-muted">{worker.description}</p>
    </div>
    <label class="flex items-center gap-2 text-sm text-text">
      <input type="checkbox" bind:checked={autoRefresh} class="rounded" />
      Auto-refresh (3s)
    </label>
  </div>

  <div class="grid gap-5 lg:grid-cols-3">
    <!-- Left column: Stats + Controls -->
    <div class="space-y-5">
      <!-- Queue Stats -->
      {#if worker.stats}
        <div class="rounded-lg bg-surface p-4">
          <h3 class="mb-3 text-xs font-semibold uppercase text-text">Queue Stats</h3>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <p class="text-xs text-text">Waiting</p>
              <p class="text-xl font-bold text-yellow-300">{worker.stats.waiting}</p>
            </div>
            <div>
              <p class="text-xs text-text">Active</p>
              <p class="text-xl font-bold text-cyan-300">{worker.stats.active}</p>
            </div>
            <div>
              <p class="text-xs text-text">Completed</p>
              <p class="text-xl font-bold text-green-300">{worker.stats.completed}</p>
            </div>
            <div>
              <p class="text-xs text-text">Failed</p>
              <p class="text-xl font-bold text-red-300">{worker.stats.failed}</p>
            </div>
            <div>
              <p class="text-xs text-text">Delayed</p>
              <p class="text-xl font-bold text-orange-300">{worker.stats.delayed}</p>
            </div>
            <div>
              <p class="text-xs text-text">Status</p>
              <p class="text-xl font-bold {worker.stats.paused ? 'text-yellow-300' : 'text-green-300'}">
                {worker.stats.paused ? '⏸ Paused' : '▶ Running'}
              </p>
            </div>
          </div>
          <div class="mt-2 text-xs text-text-muted">Concurrency: {worker.concurrency}</div>
        </div>
      {/if}

      <!-- KB Builder specific status -->
      {#if worker.kbBuilderStatus}
        <div class="rounded-lg bg-surface p-4">
          <h3 class="mb-3 text-xs font-semibold uppercase text-text">Service Status</h3>
          <pre class="overflow-auto rounded bg-background p-3 text-xs text-text-muted">{JSON.stringify(worker.kbBuilderStatus, null, 2)}</pre>
        </div>
      {/if}

      <!-- Queue controls (BullMQ only) -->
      {#if !isStandaloneService}
        <div class="rounded-lg bg-surface p-4">
          <h3 class="mb-3 text-xs font-semibold uppercase text-text">Queue Controls</h3>
          <div class="space-y-3">
            <!-- Pause / Resume -->
            <div>
              {#if worker.stats?.paused}
                <button
                  onclick={resumeQueue}
                  disabled={actionLoading === 'resume'}
                  class="flex w-full items-center justify-center gap-2 rounded-md bg-green-600/20 px-3 py-2 text-xs font-medium text-green-300 ring-1 ring-green-600/30 hover:bg-green-600/30 disabled:opacity-50"
                >
                  {actionLoading === 'resume' ? '...' : '▶ Resume Queue'}
                </button>
              {:else}
                <button
                  onclick={pauseQueue}
                  disabled={actionLoading === 'pause'}
                  class="flex w-full items-center justify-center gap-2 rounded-md bg-yellow-600/20 px-3 py-2 text-xs font-medium text-yellow-300 ring-1 ring-yellow-600/30 hover:bg-yellow-600/30 disabled:opacity-50"
                >
                  {actionLoading === 'pause' ? '...' : '⏸ Pause Queue'}
                </button>
              {/if}
            </div>
            <!-- Cleanup & Retry -->
            <div class="grid grid-cols-2 gap-2">
              <button
                onclick={() => cleanJobs('completed')}
                disabled={actionLoading === 'clean-completed'}
                class="rounded-md bg-surface-dark px-3 py-2 text-xs font-medium text-text-muted ring-1 ring-border/30 hover:bg-surface-dark/80 hover:text-text disabled:opacity-50"
              >
                🧹 Completed
              </button>
              <button
                onclick={() => cleanJobs('failed')}
                disabled={actionLoading === 'clean-failed'}
                class="rounded-md bg-surface-dark px-3 py-2 text-xs font-medium text-text-muted ring-1 ring-border/30 hover:bg-surface-dark/80 hover:text-text disabled:opacity-50"
              >
                🧹 Failed
              </button>
            </div>
            <button
              onclick={retryFailed}
              disabled={actionLoading === 'retry'}
              class="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600/20 px-3 py-2 text-xs font-medium text-blue-300 ring-1 ring-blue-600/30 hover:bg-blue-600/30 disabled:opacity-50"
            >
              {actionLoading === 'retry' ? '...' : '🔄 Retry All Failed'}
            </button>
          </div>
        </div>
      {/if}

      <!-- Manual trigger -->
      <div class="rounded-lg bg-surface p-4">
        <h3 class="mb-3 text-xs font-semibold uppercase text-text">Manual Trigger</h3>
        {#if !isStandaloneService}
          <label for="trigger-data" class="mb-1 block text-xs text-text">Job Data (JSON)</label>
          <textarea
            id="trigger-data"
            bind:value={triggerData}
            rows="4"
            class="mb-3 w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-text"
            placeholder={JSON.stringify(worker.defaultJobData, null, 2)}
          ></textarea>
        {:else}
          <p class="mb-3 text-xs text-text-muted">Triggers the KB Builder ingestion pipeline via HTTP POST to <code class="text-text">/ingest</code>.</p>
        {/if}
        <button
          onclick={triggerJob}
          disabled={triggerLoading}
          class="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/80 disabled:opacity-50"
        >
          {triggerLoading ? 'Triggering...' : `🚀 Trigger ${worker.name}`}
        </button>
        {#if triggerResult}
          <pre class="mt-3 max-h-40 overflow-auto rounded bg-background p-2 text-xs text-text-muted">{triggerResult}</pre>
        {/if}
      </div>
    </div>

    <!-- Right column: Jobs list (BullMQ queues only) -->
    {#if !isStandaloneService}
      <div class="lg:col-span-2">
        <div class="rounded-lg bg-surface p-4">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-xs font-semibold uppercase text-text">Job History</h3>
            <div class="flex gap-1">
              {#each ['completed', 'failed', 'active', 'waiting', 'delayed'] as status}
                <button
                  onclick={() => { jobFilter = status as typeof jobFilter; }}
                  class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors
                    {jobFilter === status
                      ? (statusColors[status] || 'bg-gray-500/20 text-gray-300')
                      : 'text-text-muted hover:bg-surface-dark'}"
                >
                  {status}
                </button>
              {/each}
            </div>
          </div>

          {#if jobs.length === 0}
            <p class="py-8 text-center text-sm text-text-muted">No {jobFilter} jobs</p>
          {:else}
            <div class="space-y-1">
              {#each jobs as job}
                <div class="rounded-md bg-surface-dark/50 transition-colors">
                  <button
                    onclick={() => toggleExpandJob(job.id)}
                    class="flex w-full items-center gap-3 px-3 py-2.5 text-left text-xs hover:bg-surface-dark"
                  >
                    <span class="font-mono text-text-muted">{job.id || '—'}</span>
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium {statusColors[job.status] || 'bg-gray-500/20 text-gray-300'}">
                      {job.status}
                    </span>
                    <span class="flex-1 truncate text-text-muted">
                      {Object.entries(job.data).map(([k, v]) => `${k}=${v}`).join(', ').slice(0, 80)}
                    </span>
                    <span class="text-text-muted">{formatDuration(job.duration)}</span>
                    <span class="text-text-muted">{formatTimestamp(job.timestamp)}</span>
                    <span class="text-text-muted transition-transform {expandedJobId === job.id ? 'rotate-180' : ''}">▾</span>
                  </button>

                  {#if expandedJobId === job.id}
                    <div class="border-t border-border/30 px-3 py-3">
                      <div class="grid gap-4 lg:grid-cols-2">
                        <!-- Job details -->
                        <div class="space-y-3">
                          <div>
                            <h4 class="mb-1 text-xs font-semibold uppercase text-text">Job Details</h4>
                            <dl class="space-y-1 text-xs">
                              <div class="flex gap-2">
                                <dt class="w-24 shrink-0 text-text">Job ID</dt>
                                <dd class="font-mono text-text break-all">{job.id}</dd>
                              </div>
                              <div class="flex gap-2">
                                <dt class="w-24 shrink-0 text-text">Status</dt>
                                <dd class="text-text">{job.status}</dd>
                              </div>
                              <div class="flex gap-2">
                                <dt class="w-24 shrink-0 text-text">Attempts</dt>
                                <dd class="text-text">{job.attemptsMade}</dd>
                              </div>
                              <div class="flex gap-2">
                                <dt class="w-24 shrink-0 text-text">Created</dt>
                                <dd class="text-text">{formatTimestamp(job.timestamp)}</dd>
                              </div>
                              <div class="flex gap-2">
                                <dt class="w-24 shrink-0 text-text">Started</dt>
                                <dd class="text-text">{formatTimestamp(job.processedOn)}</dd>
                              </div>
                              <div class="flex gap-2">
                                <dt class="w-24 shrink-0 text-text">Finished</dt>
                                <dd class="text-text">{formatTimestamp(job.finishedOn)}</dd>
                              </div>
                              <div class="flex gap-2">
                                <dt class="w-24 shrink-0 text-text">Duration</dt>
                                <dd class="text-text">{formatDuration(job.duration)}</dd>
                              </div>
                              {#if job.failedReason}
                                <div class="flex gap-2">
                                  <dt class="w-24 shrink-0 text-red-400">Error</dt>
                                  <dd class="text-red-300 break-all">{job.failedReason}</dd>
                                </div>
                              {/if}
                            </dl>
                          </div>

                          <div>
                            <h4 class="mb-1 text-xs font-semibold uppercase text-text">Input Data</h4>
                            <pre class="max-h-48 overflow-auto rounded bg-background p-2 text-xs text-text-muted">{JSON.stringify(job.data, null, 2)}</pre>
                          </div>

                          {#if job.returnvalue !== undefined && job.returnvalue !== null}
                            <div>
                              <h4 class="mb-1 text-xs font-semibold uppercase text-text">Return Value</h4>
                              <pre class="max-h-48 overflow-auto rounded bg-background p-2 text-xs text-text-muted">{JSON.stringify(job.returnvalue, null, 2)}</pre>
                            </div>
                          {/if}
                        </div>

                        <!-- Job logs -->
                        <div>
                          <h4 class="mb-1 text-xs font-semibold uppercase text-text">Logs</h4>
                          <div class="max-h-96 overflow-auto rounded bg-background p-2">
                            {#if jobLogs[job.id] && jobLogs[job.id].length > 0}
                              {#each jobLogs[job.id] as line}
                                <div class="border-b border-border/20 py-0.5 font-mono text-xs text-text-muted">{line}</div>
                              {/each}
                            {:else}
                              <p class="py-4 text-center text-xs text-text-muted">No logs available</p>
                            {/if}
                          </div>

                          <h4 class="mb-1 mt-3 text-xs font-semibold uppercase text-text">Raw Job JSON</h4>
                          <pre class="max-h-48 overflow-auto rounded bg-background p-2 text-xs text-text-muted">{JSON.stringify(job, null, 2)}</pre>
                        </div>
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
