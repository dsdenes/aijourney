<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { startPolling } from '$lib/utils/polling';

  interface ArticleDetail {
    id: string;
    title: string;
    url: string;
    status: string;
    hasSummary: boolean;
    tokensUsed: number;
    promptTokens: number;
    completionTokens: number;
    model: string | null;
    summarizedAt: string | null;
  }

  interface SummarizationStats {
    totalArticles: number;
    totalEligible: number;
    totalSummarized: number;
    totalToSummarize: number;
    percent: number;
    totalTokens: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCost: number;
    costPerArticle: number;
    model: string;
    articles: ArticleDetail[];
  }

  let stats = $state<SummarizationStats | null>(null);
  let loading = $state(true);
  let search = $state('');
  let filterStatus = $state<'all' | 'summarized' | 'pending'>('all');
  let summarizing = $state(false);
  let summarizeMessage = $state('');
  let stopRefresh: ReturnType<typeof startPolling> | null = null;

  const filteredArticles = $derived(() => {
    if (!stats) return [];
    let result = stats.articles;
    if (filterStatus === 'summarized') {
      result = result.filter((a) => a.hasSummary);
    } else if (filterStatus === 'pending') {
      result = result.filter((a) => !a.hasSummary);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((a) => a.title.toLowerCase().includes(q) || a.url.toLowerCase().includes(q));
    }
    return result;
  });
  const shouldPoll = $derived(summarizing || (stats?.totalToSummarize ?? 0) > 0);

  async function loadStats() {
    loading = true;
    try {
      const res = await api.get<SummarizationStats>('/workers/kb-builder/summarization-stats');
      stats = (res as any).data?.data ?? (res as any).data ?? null;
    } catch {
      stats = null;
    } finally {
      loading = false;
    }
  }

  async function startSummarization() {
    summarizing = true;
    summarizeMessage = '';
    try {
      const res = await api.post<{ status: string; message: string }>('/workers/kb-builder/summarize', {});
      if (res.data) {
        summarizeMessage = res.data.message || 'Summarization started';
      } else if (res.error) {
        summarizeMessage = `Error: ${res.error.message}`;
      }
      setTimeout(() => loadStats(), 8000);
    } catch {
      summarizeMessage = 'Failed to start summarization — KB Builder may be offline.';
    } finally {
      summarizing = false;
    }
  }

  function formatCost(cost: number): string {
    if (cost === 0) return '$0.00';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  onMount(() => {
    loadStats();
    return () => {
      stopRefresh?.();
    };
  });

  $effect(() => {
    stopRefresh?.();
    stopRefresh = null;

    if (shouldPoll) {
      stopRefresh = startPolling(loadStats, {
        intervalMs: 15000,
        runImmediately: false,
      });
    }

    return () => {
      stopRefresh?.();
      stopRefresh = null;
    };
  });
</script>

{#if loading && !stats}
  <div class="flex items-center justify-center py-12">
    <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
  </div>
{:else if !stats}
  <div class="rounded-lg bg-surface py-16 text-center ring-1 ring-border/30">
    <p class="text-lg font-medium text-text-muted">Unable to load stats</p>
    <p class="mt-2 text-sm text-text-muted">KB Builder service might be offline.</p>
  </div>
{:else}
  <!-- Header -->
  <div class="mb-5 flex items-start justify-between">
    <div>
      <h2 class="text-lg font-semibold text-text">Summarization</h2>
      <p class="mt-1 max-w-2xl text-sm text-text-muted">
        AI-generated summaries from crawled knowledge base articles. Model: <span class="font-mono text-xs text-primary">{stats.model}</span>
      </p>
    </div>
    <div class="flex items-center gap-2">
      <button
        onclick={startSummarization}
        disabled={summarizing}
        class="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {#if summarizing}
          <span class="inline-flex items-center gap-1.5">
            <span class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
            Running…
          </span>
        {:else}
          ▶ Start Summarization
        {/if}
      </button>
      <button
        onclick={loadStats}
        class="rounded-md bg-surface px-3 py-1.5 text-xs font-medium text-text-muted ring-1 ring-border hover:text-text"
      >
        ↻ Reload
      </button>
    </div>
  </div>

  <!-- Status message -->
  {#if summarizeMessage}
    <div class="mb-4 rounded-lg border px-4 py-2.5 text-sm {summarizeMessage.startsWith('Error') || summarizeMessage.startsWith('Failed') ? 'border-danger/30 bg-danger/5 text-danger' : 'border-success/30 bg-success/5 text-success'}">
      {summarizeMessage}
    </div>
  {/if}

  <!-- Stats cards -->
  <div class="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
    <div class="rounded-lg bg-surface p-3 ring-1 ring-border/30">
      <p class="text-[11px] uppercase tracking-wide text-text-muted">Summarized</p>
      <p class="mt-1 text-2xl font-bold text-text">{stats.totalSummarized}</p>
      <p class="text-[10px] text-text-muted">of {stats.totalEligible} eligible</p>
    </div>
    <div class="rounded-lg bg-surface p-3 ring-1 ring-border/30">
      <p class="text-[11px] uppercase tracking-wide text-text-muted">To Summarize</p>
      <p class="mt-1 text-2xl font-bold {stats.totalToSummarize > 0 ? 'text-warning' : 'text-success'}">{stats.totalToSummarize}</p>
      <p class="text-[10px] text-text-muted">articles remaining</p>
    </div>
    <div class="rounded-lg bg-surface p-3 ring-1 ring-border/30">
      <p class="text-[11px] uppercase tracking-wide text-text-muted">Progress</p>
      <p class="mt-1 text-2xl font-bold text-primary">{stats.percent}%</p>
      <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-dark">
        <div class="h-full rounded-full bg-primary transition-all" style="width: {stats.percent}%"></div>
      </div>
    </div>
    <div class="rounded-lg bg-surface p-3 ring-1 ring-border/30">
      <p class="text-[11px] uppercase tracking-wide text-text-muted">Cost / Article</p>
      <p class="mt-1 text-2xl font-bold text-text">{formatCost(stats.costPerArticle)}</p>
      <p class="text-[10px] text-text-muted">avg cost per summary</p>
    </div>
    <div class="rounded-lg bg-surface p-3 ring-1 ring-border/30">
      <p class="text-[11px] uppercase tracking-wide text-text-muted">Total Cost</p>
      <p class="mt-1 text-2xl font-bold text-text">{formatCost(stats.totalCost)}</p>
      <p class="text-[10px] text-text-muted">{stats.totalTokens.toLocaleString()} tokens</p>
    </div>
    <div class="rounded-lg bg-surface p-3 ring-1 ring-border/30">
      <p class="text-[11px] uppercase tracking-wide text-text-muted">Total Articles</p>
      <p class="mt-1 text-2xl font-bold text-text">{stats.totalArticles}</p>
      <p class="text-[10px] text-text-muted">in knowledge base</p>
    </div>
  </div>

  <!-- Filters -->
  <div class="mb-4 flex items-center gap-3">
    <input
      type="text"
      bind:value={search}
      placeholder="Search by title or URL…"
      class="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted"
    />
    <select
      bind:value={filterStatus}
      class="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
    >
      <option value="all">All ({stats.totalEligible})</option>
      <option value="summarized">Summarized ({stats.totalSummarized})</option>
      <option value="pending">Pending ({stats.totalToSummarize})</option>
    </select>
  </div>

  <!-- Article count -->
  <p class="mb-3 text-xs text-text-muted">
    Showing {filteredArticles().length} articles
  </p>

  <!-- Article table -->
  {#if stats.articles.length === 0}
    <div class="rounded-lg bg-surface py-16 text-center ring-1 ring-border/30">
      <p class="text-lg font-medium text-text-muted">No eligible articles</p>
      <p class="mt-2 text-sm text-text-muted">
        Go to <a href="/settings/kb-builder" class="text-primary hover:underline">KB Builder</a> and run the pipeline to crawl and quality-filter articles.
      </p>
    </div>
  {:else}
    <div class="overflow-hidden rounded-lg ring-1 ring-border/30">
      <table class="w-full text-left text-sm">
        <thead class="bg-surface text-[11px] uppercase tracking-wide text-text-muted">
          <tr>
            <th class="px-4 py-2.5">Article</th>
            <th class="px-4 py-2.5 text-center">Status</th>
            <th class="px-4 py-2.5 text-right">Tokens</th>
            <th class="px-4 py-2.5 text-right">Cost</th>
            <th class="px-4 py-2.5 text-right">Model</th>
            <th class="px-4 py-2.5 text-right">Summarized</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border/10">
          {#each filteredArticles() as article}
            <tr class="bg-surface/50 hover:bg-surface transition-colors">
              <td class="px-4 py-2.5">
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-sm font-medium text-primary hover:underline"
                  title={article.url}
                >
                  {article.title || 'Untitled'}
                </a>
              </td>
              <td class="px-4 py-2.5 text-center">
                {#if article.hasSummary}
                  <span class="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                    ✓ Done
                  </span>
                {:else}
                  <span class="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                    ⏳ Pending
                  </span>
                {/if}
              </td>
              <td class="px-4 py-2.5 text-right font-mono text-xs text-text-muted">
                {article.tokensUsed > 0 ? article.tokensUsed.toLocaleString() : '—'}
              </td>
              <td class="px-4 py-2.5 text-right font-mono text-xs text-text-muted">
                {#if article.promptTokens > 0}
                  {formatCost((article.promptTokens * 0.10 + article.completionTokens * 0.40) / 1_000_000)}
                {:else}
                  —
                {/if}
              </td>
              <td class="px-4 py-2.5 text-right font-mono text-[10px] text-text-muted">
                {article.model || '—'}
              </td>
              <td class="px-4 py-2.5 text-right text-xs text-text-muted">
                {article.summarizedAt ? formatDate(article.summarizedAt) : '—'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}
