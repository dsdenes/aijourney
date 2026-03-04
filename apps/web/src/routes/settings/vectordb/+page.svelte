<script lang="ts">
  import { api } from '$lib/api';
  import { onMount } from 'svelte';

  interface VectorDbStats {
    index: {
      name: string;
      dimension: number;
      metric: string;
      state: string;
      totalRecordCount: number;
      indexFullness: number;
      namespaces: Record<string, { recordCount: number }>;
    };
    articles: {
      total: number;
      byStatus: Record<string, number>;
    };
    embedding: {
      model: string;
      dimension: number;
      provider: string;
    };
  }

  let stats = $state<VectorDbStats | null>(null);
  let loading = $state(true);
  let error = $state('');
  let ingesting = $state(false);
  let ingestMessage = $state('');
  let autoRefresh = $state(false);
  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  async function loadStats() {
    try {
      const res = await api.get<VectorDbStats>('/workers/kb-builder/rag/stats');
      if (res.data) {
        stats = res.data;
        error = '';
      } else if ((res as any).error) {
        error = (res as any).error.message || 'Failed to load stats';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load vector DB stats';
    } finally {
      loading = false;
    }
  }

  async function triggerIngestion() {
    ingesting = true;
    ingestMessage = '';
    try {
      const res = await api.post<{ status: string; message: string }>('/workers/kb-builder/rag/ingest');
      if (res.data) {
        ingestMessage = (res.data as any).message || 'Ingestion started';
      } else if ((res as any).error) {
        ingestMessage = `Error: ${(res as any).error.message}`;
      }
      // Start auto-refresh to track progress
      autoRefresh = true;
    } catch (err) {
      ingestMessage = `Error: ${err instanceof Error ? err.message : 'Ingestion trigger failed'}`;
    } finally {
      ingesting = false;
    }
  }

  function formatNumber(n: number): string {
    return n.toLocaleString();
  }

  function formatPercent(n: number): string {
    return `${(n * 100).toFixed(1)}%`;
  }

  const pendingIngestion = $derived(stats?.articles.byStatus['summarized'] ?? 0);
  const totalIngested = $derived(stats?.articles.byStatus['ingested'] ?? 0);
  const totalArticles = $derived(stats?.articles.total ?? 0);
  const ingestionProgress = $derived(
    totalArticles > 0 ? ((totalIngested) / totalArticles) * 100 : 0
  );

  const stateColor = $derived(() => {
    if (!stats) return 'bg-gray-100 text-gray-700';
    switch (stats.index.state) {
      case 'Ready': return 'bg-green-100 text-green-700';
      case 'Initializing': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-red-100 text-red-700';
    }
  });

  const statusColors: Record<string, string> = {
    fetched: 'bg-slate-100 text-slate-700',
    extracted: 'bg-indigo-100 text-indigo-700',
    deduped: 'bg-purple-100 text-purple-700',
    quality_passed: 'bg-cyan-100 text-cyan-700',
    quality_failed: 'bg-red-100 text-red-700',
    summarized: 'bg-yellow-100 text-yellow-700',
    ingested: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  };

  const statusLabels: Record<string, string> = {
    fetched: 'Fetched',
    extracted: 'Extracted',
    deduped: 'Deduplicated',
    quality_passed: 'Quality Passed',
    quality_failed: 'Quality Failed',
    summarized: 'Summarized (pending ingest)',
    ingested: 'Ingested into Vector DB',
    rejected: 'Rejected',
  };

  onMount(() => {
    loadStats();
    refreshInterval = setInterval(() => {
      if (autoRefresh) loadStats();
    }, 5000);
    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  });
</script>

{#if loading}
  <div class="flex items-center justify-center py-12">
    <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
  </div>
{:else if error && !stats}
  <div class="rounded-lg bg-red-900/30 p-4 text-red-200">
    <p class="font-medium">Failed to load Vector DB stats</p>
    <p class="mt-1 text-sm">{error}</p>
    <button
      onclick={loadStats}
      class="mt-3 rounded-md bg-red-800/50 px-3 py-1.5 text-xs font-medium text-red-200 transition-colors hover:bg-red-800"
    >
      Retry
    </button>
  </div>
{:else if stats}
  <!-- Top metric cards -->
  <div class="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
    <div class="rounded-lg bg-surface p-4">
      <p class="text-xs font-semibold uppercase text-text-muted">Total Vectors</p>
      <p class="mt-1 text-2xl font-bold text-text">{formatNumber(stats.index.totalRecordCount)}</p>
      <p class="text-xs text-text-muted">in Pinecone index</p>
    </div>
    <div class="rounded-lg bg-surface p-4">
      <p class="text-xs font-semibold uppercase text-text-muted">Index Status</p>
      <p class="mt-1">
        <span class="rounded-full px-2.5 py-1 text-sm font-semibold {stateColor()}">
          {stats.index.state}
        </span>
      </p>
      <p class="mt-1 text-xs text-text-muted">Fullness: {formatPercent(stats.index.indexFullness)}</p>
    </div>
    <div class="rounded-lg bg-surface p-4">
      <p class="text-xs font-semibold uppercase text-text-muted">Articles Ingested</p>
      <p class="mt-1 text-2xl font-bold text-text">{formatNumber(totalIngested)}</p>
      <p class="text-xs text-text-muted">of {formatNumber(totalArticles)} total</p>
    </div>
    <div class="rounded-lg bg-surface p-4">
      <p class="text-xs font-semibold uppercase text-text-muted">Pending Ingestion</p>
      <p class="mt-1 text-2xl font-bold {pendingIngestion > 0 ? 'text-yellow-600' : 'text-green-600'}">
        {formatNumber(pendingIngestion)}
      </p>
      <p class="text-xs text-text-muted">summarized articles</p>
    </div>
  </div>

  <div class="grid gap-6 lg:grid-cols-2">
    <!-- Index Configuration -->
    <div class="rounded-lg bg-surface p-5">
      <h2 class="mb-4 text-sm font-semibold uppercase text-text">Index Configuration</h2>
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-sm text-text-muted">Index Name</span>
          <span class="font-mono text-sm text-text">{stats.index.name}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-text-muted">Dimensions</span>
          <span class="font-mono text-sm text-text">{stats.index.dimension}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-text-muted">Metric</span>
          <span class="font-mono text-sm text-text">{stats.index.metric}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-text-muted">Embedding Model</span>
          <span class="font-mono text-sm text-text">{stats.embedding.model}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-text-muted">Embedding Provider</span>
          <span class="text-sm text-text capitalize">{stats.embedding.provider}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-text-muted">Embedding Dimensions</span>
          <span class="font-mono text-sm text-text">{stats.embedding.dimension}</span>
        </div>
      </div>
    </div>

    <!-- Namespaces -->
    <div class="rounded-lg bg-surface p-5">
      <h2 class="mb-4 text-sm font-semibold uppercase text-text">Namespaces</h2>
      {#if Object.keys(stats.index.namespaces).length === 0}
        <p class="text-sm text-text-muted">No namespaces (using default)</p>
        <div class="mt-2 flex items-center justify-between rounded-md bg-surface-dark p-3">
          <span class="font-mono text-sm text-text-muted">(default)</span>
          <span class="text-sm font-medium text-text">{formatNumber(stats.index.totalRecordCount)} vectors</span>
        </div>
      {:else}
        <div class="space-y-2">
          {#each Object.entries(stats.index.namespaces) as [ns, data]}
            <div class="flex items-center justify-between rounded-md bg-surface-dark p-3">
              <span class="font-mono text-sm text-text">{ns || '(default)'}</span>
              <span class="text-sm font-medium text-text">{formatNumber(data.recordCount)} vectors</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Article Pipeline Status -->
    <div class="rounded-lg bg-surface p-5">
      <h2 class="mb-4 text-sm font-semibold uppercase text-text">Article Pipeline</h2>
      <!-- Progress bar -->
      <div class="mb-4">
        <div class="mb-1 flex items-center justify-between text-xs text-text-muted">
          <span>Ingestion Progress</span>
          <span>{ingestionProgress.toFixed(0)}%</span>
        </div>
        <div class="h-2.5 overflow-hidden rounded-full bg-surface-dark">
          <div
            class="h-full rounded-full bg-green-500 transition-all duration-500"
            style="width: {ingestionProgress}%"
          ></div>
        </div>
      </div>
      <!-- Status breakdown -->
      <div class="space-y-2">
        {#each Object.entries(stats.articles.byStatus).sort((a, b) => b[1] - a[1]) as [status, count]}
          <div class="flex items-center justify-between">
            <span class="rounded-full px-2.5 py-0.5 text-xs font-medium {statusColors[status] || 'bg-gray-100 text-gray-700'}">
              {statusLabels[status] || status}
            </span>
            <div class="flex items-center gap-2">
              <div class="h-2 w-20 overflow-hidden rounded-full bg-surface-dark">
                <div
                  class="h-full rounded-full bg-primary"
                  style="width: {totalArticles > 0 ? (count / totalArticles) * 100 : 0}%"
                ></div>
              </div>
              <span class="w-10 text-right text-sm font-medium text-text">{count}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Ingestion Actions -->
    <div class="rounded-lg bg-surface p-5">
      <h2 class="mb-4 text-sm font-semibold uppercase text-text">Ingestion Actions</h2>
      <p class="mb-4 text-sm text-text-muted">
        Ingest summarized articles into the Pinecone vector database. This embeds the text using
        OpenAI <code class="rounded bg-surface-dark px-1.5 py-0.5 text-xs text-text">text-embedding-3-small</code>
        and upserts vectors into Pinecone.
      </p>

      {#if pendingIngestion > 0}
        <div class="mb-4 rounded-md bg-yellow-900/20 p-3">
          <p class="text-sm text-yellow-700">
            <span class="font-semibold">{pendingIngestion}</span> article{pendingIngestion !== 1 ? 's' : ''} ready for ingestion
          </p>
        </div>
      {:else}
        <div class="mb-4 rounded-md bg-green-900/20 p-3">
          <p class="text-sm text-green-700">All articles are ingested. Nothing to do.</p>
        </div>
      {/if}

      <div class="flex items-center gap-3">
        <button
          onclick={triggerIngestion}
          disabled={ingesting || pendingIngestion === 0}
          class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors
            hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if ingesting}
            <span class="flex items-center gap-2">
              <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
              Starting...
            </span>
          {:else}
            Run Ingestion
          {/if}
        </button>
        <button
          onclick={loadStats}
          class="rounded-lg bg-surface-dark px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface hover:text-text"
        >
          Refresh Stats
        </button>
        <label class="flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" bind:checked={autoRefresh} class="rounded border-border" />
          Auto-refresh
        </label>
      </div>

      {#if ingestMessage}
        <div class="mt-3 rounded-md bg-surface-dark p-3">
          <p class="text-sm text-text-muted">{ingestMessage}</p>
        </div>
      {/if}
    </div>
  </div>
{/if}
