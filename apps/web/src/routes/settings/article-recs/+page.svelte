<script lang="ts">
  import { api } from '$lib/api';

  interface RecStats {
    totalBatches: number;
    totalRecommendations: number;
    readCount: number;
    dismissedCount: number;
    pendingCount: number;
    readRate: number;
    lastBatch?: {
      id: string;
      status: string;
      completedAt?: string;
      totalRecommendations: number;
    };
    jobTitleStats: { jobTitle: string; userCount: number; recCount: number }[];
  }

  interface QueueStats {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    schedulers: { id: string; name: string; pattern: string; next: number }[];
  }

  interface RecBatch {
    id: string;
    status: string;
    jobTitles: string[];
    totalUsers: number;
    totalRecommendations: number;
    startedAt: string;
    completedAt?: string;
    error?: string;
    createdAt: string;
  }

  interface ArticleRec {
    id: string;
    userId: string;
    jobTitle: string;
    article: { url: string; title: string; source: string; summary: string; tags: string[]; difficulty: string };
    reason: string;
    status: string;
    createdAt: string;
  }

  let stats = $state<RecStats | null>(null);
  let queueStats = $state<QueueStats | null>(null);
  let batches = $state<RecBatch[]>([]);
  let selectedBatchRecs = $state<ArticleRec[]>([]);
  let selectedBatchId = $state<string | null>(null);
  let loading = $state(true);
  let triggering = $state(false);
  let error = $state('');

  $effect(() => {
    loadData();
  });

  async function loadData() {
    try {
      loading = true;
      error = '';
      const [statsRes, queueRes, batchRes] = await Promise.all([
        api.get<RecStats>('/article-recs/admin/stats'),
        api.get<QueueStats>('/article-recs/admin/queue'),
        api.get<RecBatch[]>('/article-recs/admin/batches'),
      ]);
      stats = statsRes.data ?? null;
      queueStats = queueRes.data ?? null;
      batches = batchRes.data ?? [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load data';
    } finally {
      loading = false;
    }
  }

  async function triggerBatch() {
    triggering = true;
    try {
      await api.post('/article-recs/admin/trigger');
      // Reload after short delay
      setTimeout(loadData, 1000);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to trigger batch';
    } finally {
      triggering = false;
    }
  }

  async function viewBatchRecs(batchId: string) {
    if (selectedBatchId === batchId) {
      selectedBatchId = null;
      selectedBatchRecs = [];
      return;
    }
    try {
      const res = await api.get<ArticleRec[]>(`/article-recs/admin/batches/${batchId}`);
      selectedBatchRecs = res.data ?? [];
      selectedBatchId = batchId;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load batch';
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString();
  }

  function statusColor(status: string) {
    switch (status) {
      case 'completed': return 'text-success';
      case 'failed': return 'text-red-400';
      case 'pending': return 'text-yellow-400';
      case 'fetching_articles':
      case 'selecting_articles': return 'text-blue-400';
      default: return 'text-text-muted';
    }
  }
</script>

<div class="space-y-6">
  <!-- Header + Trigger -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-semibold text-text">Article Recommendations</h2>
      <p class="mt-1 text-sm text-text-muted">
        Automated personalized article recommendations. Runs twice per week (Mon + Thu 08:00 UTC).
      </p>
    </div>
    <button
      onclick={triggerBatch}
      disabled={triggering}
      class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
    >
      {triggering ? 'Triggering…' : '▶ Trigger Batch Now'}
    </button>
  </div>

  {#if error}
    <div class="rounded-lg bg-red-900/30 p-3 text-sm text-red-300">{error}</div>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
    </div>
  {:else if stats}
    <!-- Stats Cards -->
    <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div class="rounded-xl bg-surface p-4 ring-1 ring-border">
        <p class="text-xs font-semibold uppercase text-text-muted">Total Recs</p>
        <p class="mt-1 text-2xl font-bold text-text">{stats.totalRecommendations}</p>
      </div>
      <div class="rounded-xl bg-surface p-4 ring-1 ring-border">
        <p class="text-xs font-semibold uppercase text-text-muted">Read Rate</p>
        <p class="mt-1 text-2xl font-bold text-success">{stats.readRate}%</p>
      </div>
      <div class="rounded-xl bg-surface p-4 ring-1 ring-border">
        <p class="text-xs font-semibold uppercase text-text-muted">Pending</p>
        <p class="mt-1 text-2xl font-bold text-yellow-400">{stats.pendingCount}</p>
      </div>
      <div class="rounded-xl bg-surface p-4 ring-1 ring-border">
        <p class="text-xs font-semibold uppercase text-text-muted">Batches Run</p>
        <p class="mt-1 text-2xl font-bold text-text">{stats.totalBatches}</p>
      </div>
    </div>

    <!-- Breakdown cards -->
    <div class="grid gap-4 md:grid-cols-2">
      <!-- By Status -->
      <div class="rounded-xl bg-surface p-4 ring-1 ring-border">
        <h3 class="mb-3 text-sm font-semibold text-text">Recommendations by Status</h3>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm text-text-muted">📬 Pending</span>
            <span class="font-mono text-sm text-yellow-400">{stats.pendingCount}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-text-muted">✅ Read</span>
            <span class="font-mono text-sm text-success">{stats.readCount}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-text-muted">🚫 Dismissed</span>
            <span class="font-mono text-sm text-red-400">{stats.dismissedCount}</span>
          </div>
        </div>
      </div>

      <!-- Queue stats -->
      {#if queueStats}
        <div class="rounded-xl bg-surface p-4 ring-1 ring-border">
          <h3 class="mb-3 text-sm font-semibold text-text">Queue Status</h3>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm text-text-muted">Waiting</span>
              <span class="font-mono text-sm text-text">{queueStats.waiting}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-text-muted">Active</span>
              <span class="font-mono text-sm text-blue-400">{queueStats.active}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-text-muted">Completed</span>
              <span class="font-mono text-sm text-success">{queueStats.completed}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-text-muted">Failed</span>
              <span class="font-mono text-sm text-red-400">{queueStats.failed}</span>
            </div>
            {#if queueStats.schedulers.length > 0}
              <div class="mt-3 border-t border-border pt-2">
                <p class="text-xs font-semibold text-text-muted">Schedulers</p>
                {#each queueStats.schedulers as sched}
                  <div class="mt-1 text-xs text-text-muted">
                    <span class="font-mono">{sched.pattern}</span>
                    {#if sched.next}
                      — next: {new Date(sched.next).toLocaleString()}
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Last Batch -->
    {#if stats.lastBatch}
      <div class="rounded-xl bg-surface p-4 ring-1 ring-border">
        <h3 class="mb-2 text-sm font-semibold text-text">Last Batch</h3>
        <div class="flex items-center gap-4 text-sm">
          <span class="font-mono text-text-muted">{stats.lastBatch.id.slice(0, 12)}…</span>
          <span class={statusColor(stats.lastBatch.status)}>{stats.lastBatch.status}</span>
          <span class="text-text-muted">{stats.lastBatch.totalRecommendations} recs</span>
          {#if stats.lastBatch.completedAt}
            <span class="text-text-muted">{formatDate(stats.lastBatch.completedAt)}</span>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Job Title Stats -->
    {#if stats.jobTitleStats.length > 0}
      <div class="rounded-xl bg-surface p-4 ring-1 ring-border">
        <h3 class="mb-3 text-sm font-semibold text-text">Recommendations by Job Title</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-border text-text-muted">
                <th class="pb-2 pr-4 font-medium">Job Title</th>
                <th class="pb-2 pr-4 font-medium text-right">Users</th>
                <th class="pb-2 font-medium text-right">Recs</th>
              </tr>
            </thead>
            <tbody>
              {#each stats.jobTitleStats as jt}
                <tr class="border-b border-border/50">
                  <td class="py-2 pr-4 text-text">{jt.jobTitle}</td>
                  <td class="py-2 pr-4 text-right font-mono text-text-muted">{jt.userCount}</td>
                  <td class="py-2 text-right font-mono text-primary">{jt.recCount}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    <!-- Batch History -->
    <div class="rounded-xl bg-surface p-4 ring-1 ring-border">
      <h3 class="mb-3 text-sm font-semibold text-text">Batch History</h3>
      {#if batches.length === 0}
        <p class="py-4 text-center text-sm text-text-muted">No batches yet. Trigger one to get started.</p>
      {:else}
        <div class="space-y-2">
          {#each batches as batch}
            <div class="rounded-lg ring-1 ring-border/50">
              <button
                onclick={() => viewBatchRecs(batch.id)}
                class="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-surface-dark transition-colors rounded-lg"
              >
                <div class="flex items-center gap-3">
                  <span class="font-mono text-xs text-text-muted">{batch.id.slice(0, 10)}…</span>
                  <span class={statusColor(batch.status)}>{batch.status}</span>
                  <span class="text-text-muted">{batch.totalRecommendations} recs · {batch.totalUsers} users</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-xs text-text-muted">{formatDate(batch.createdAt)}</span>
                  <span class="text-text-muted">{selectedBatchId === batch.id ? '▼' : '▶'}</span>
                </div>
              </button>

              {#if selectedBatchId === batch.id}
                <div class="border-t border-border/50 px-4 py-3">
                  {#if batch.error}
                    <div class="mb-3 rounded bg-red-900/30 p-2 text-xs text-red-300">{batch.error}</div>
                  {/if}
                  {#if batch.jobTitles.length > 0}
                    <p class="mb-2 text-xs text-text-muted">
                      Job titles: {batch.jobTitles.join(', ')}
                    </p>
                  {/if}
                  {#if selectedBatchRecs.length > 0}
                    <div class="space-y-2 max-h-96 overflow-y-auto">
                      {#each selectedBatchRecs as rec}
                        <div class="rounded bg-surface-dark p-3 text-xs">
                          <div class="flex items-center justify-between mb-1">
                            <a
                              href={rec.article.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="font-medium text-primary hover:underline"
                            >{rec.article.title}</a>
                            <span class={`text-xs ${rec.status === 'read' ? 'text-success' : rec.status === 'dismissed' ? 'text-red-400' : 'text-yellow-400'}`}>
                              {rec.status}
                            </span>
                          </div>
                          <p class="text-text-muted">
                            👤 {rec.userId.slice(0, 8)}… · 💼 {rec.jobTitle} · 📖 {rec.article.source}
                          </p>
                          <p class="mt-1 text-text-muted italic">"{rec.reason}"</p>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="text-xs text-text-muted">No recommendations in this batch.</p>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
