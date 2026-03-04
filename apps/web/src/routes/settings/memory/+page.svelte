<script lang="ts">
  import { api } from '$lib/api';
  import { onMount } from 'svelte';

  interface MemoryExtraction {
    id: string;
    userId: string;
    source: string;
    factsExtracted: number;
    inputLength: number;
    processedAt: string;
    durationMs: number;
    status: string;
    error?: string;
  }

  interface MemoryStats {
    totalFacts: number;
    factsByCategory: Record<string, number>;
    factsBySource: Record<string, number>;
    queueStats: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
    recentExtractions: MemoryExtraction[];
  }

  let stats = $state<MemoryStats | null>(null);
  let loading = $state(true);
  let error = $state('');
  let autoRefresh = $state(true);
  let refreshInterval: ReturnType<typeof setInterval>;

  async function loadStats() {
    try {
      const res = await api.get<MemoryStats>('/memory/stats');
      if (res.data) stats = res.data;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load stats';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadStats();
    refreshInterval = setInterval(() => {
      if (autoRefresh) loadStats();
    }, 5000);
    return () => clearInterval(refreshInterval);
  });

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  const categoryIcons: Record<string, string> = {
    preferences: '⚙️',
    goals: '🎯',
    skills: '🛠️',
    context: '📋',
    personality: '🧠',
  };

  const sourceLabels: Record<string, string> = {
    'ai-planner': 'AI Planner',
    'ai-chat': 'AI Chat',
    'prompt-optimizer': 'Optimize Prompt',
  };
</script>

<div>
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-text">Long-Term Memory</h2>
      <p class="mt-1 text-sm text-text-muted">User fact extraction pipeline — monitor queue, extractions, and stored facts</p>
    </div>
    <div class="flex items-center gap-3">
      <label class="flex cursor-pointer items-center gap-2 text-sm text-text-muted">
        <input type="checkbox" bind:checked={autoRefresh} class="rounded" />
        Auto-refresh
      </label>
      <button
        onclick={loadStats}
        class="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
      >
        Refresh
      </button>
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-16">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
    </div>
  {:else if error}
    <div class="rounded-lg bg-danger/10 p-4 text-sm text-danger">{error}</div>
  {:else if stats}
    <!-- Queue Status -->
    <div class="mb-6 grid gap-3 sm:grid-cols-5">
      {#each [
        { label: 'Waiting', value: stats.queueStats.waiting, color: 'text-warning' },
        { label: 'Active', value: stats.queueStats.active, color: 'text-primary' },
        { label: 'Completed', value: stats.queueStats.completed, color: 'text-success' },
        { label: 'Failed', value: stats.queueStats.failed, color: 'text-danger' },
        { label: 'Delayed', value: stats.queueStats.delayed, color: 'text-text-muted' },
      ] as item}
        <div class="rounded-lg bg-surface p-4 ring-1 ring-border">
          <div class="text-xs font-semibold uppercase tracking-wider text-text-faint">{item.label}</div>
          <div class="mt-1 text-2xl font-bold {item.color}">{item.value.toLocaleString()}</div>
        </div>
      {/each}
    </div>

    <!-- Overview cards -->
    <div class="mb-6 grid gap-4 sm:grid-cols-3">
      <!-- Total Facts -->
      <div class="rounded-xl bg-surface p-5 ring-1 ring-border">
        <div class="text-xs font-semibold uppercase tracking-wider text-text-faint">Total Facts Stored</div>
        <div class="mt-2 text-3xl font-bold text-text">{stats.totalFacts.toLocaleString()}</div>
      </div>

      <!-- By Category -->
      <div class="rounded-xl bg-surface p-5 ring-1 ring-border">
        <div class="mb-3 text-xs font-semibold uppercase tracking-wider text-text-faint">Facts by Category</div>
        <div class="space-y-2">
          {#each Object.entries(stats.factsByCategory) as [cat, count]}
            <div class="flex items-center justify-between text-sm">
              <span class="text-text-muted">
                <span class="mr-1">{categoryIcons[cat] || '📦'}</span>{cat}
              </span>
              <span class="font-medium text-text">{count}</span>
            </div>
          {/each}
          {#if Object.keys(stats.factsByCategory).length === 0}
            <p class="text-sm text-text-faint">No facts yet</p>
          {/if}
        </div>
      </div>

      <!-- By Source -->
      <div class="rounded-xl bg-surface p-5 ring-1 ring-border">
        <div class="mb-3 text-xs font-semibold uppercase tracking-wider text-text-faint">Facts by Source</div>
        <div class="space-y-2">
          {#each Object.entries(stats.factsBySource) as [src, count]}
            <div class="flex items-center justify-between text-sm">
              <span class="text-text-muted">{sourceLabels[src] || src}</span>
              <span class="font-medium text-text">{count}</span>
            </div>
          {/each}
          {#if Object.keys(stats.factsBySource).length === 0}
            <p class="text-sm text-text-faint">No facts yet</p>
          {/if}
        </div>
      </div>
    </div>

    <!-- Recent Extractions -->
    <div class="rounded-xl bg-surface p-5 ring-1 ring-border">
      <h3 class="mb-4 text-sm font-semibold uppercase tracking-wider text-text-faint">Recent Extractions</h3>
      {#if stats.recentExtractions.length === 0}
        <p class="py-8 text-center text-sm text-text-faint">No extractions yet. Facts will appear here after users interact with AI features.</p>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border text-left text-xs font-semibold uppercase tracking-wider text-text-faint">
                <th class="pb-2 pr-4">Time</th>
                <th class="pb-2 pr-4">User</th>
                <th class="pb-2 pr-4">Source</th>
                <th class="pb-2 pr-4">Facts</th>
                <th class="pb-2 pr-4">Input</th>
                <th class="pb-2 pr-4">Duration</th>
                <th class="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {#each stats.recentExtractions as ext (ext.id)}
                <tr class="border-b border-border/50 last:border-0">
                  <td class="py-2 pr-4 text-text-muted whitespace-nowrap">{formatDate(ext.processedAt)}</td>
                  <td class="py-2 pr-4 text-text-muted font-mono text-xs">{ext.userId.slice(0, 8)}…</td>
                  <td class="py-2 pr-4 text-text-muted">{sourceLabels[ext.source] || ext.source}</td>
                  <td class="py-2 pr-4 text-text font-medium">{ext.factsExtracted}</td>
                  <td class="py-2 pr-4 text-text-muted">{ext.inputLength.toLocaleString()} chars</td>
                  <td class="py-2 pr-4 text-text-muted">{(ext.durationMs / 1000).toFixed(1)}s</td>
                  <td class="py-2">
                    {#if ext.status === 'success'}
                      <span class="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">✓</span>
                    {:else}
                      <span class="inline-flex items-center rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger" title={ext.error || ''}>✗</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
</div>
