<script lang="ts">
  import { api } from '$lib/api';
  import { onMount } from 'svelte';

  interface AgentRun {
    id: string;
    agent: string;
    status: 'running' | 'completed' | 'failed';
    input: string;
    output?: string;
    fullInput?: string;
    fullOutput?: string;
    model?: string;
    tokensUsed?: number;
    promptTokens?: number;
    completionTokens?: number;
    durationMs?: number;
    error?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
    completedAt?: string;
  }

  let runs = $state<AgentRun[]>([]);
  let loading = $state(true);
  let error = $state('');
  let expandedRunId = $state<string | null>(null);
  let filterAgent = $state('all');
  let filterStatus = $state('all');
  let autoRefresh = $state(true);
  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Estimate cost in USD based on model and token counts.
   * Prices per 1M tokens (input/output) as of mid-2025.
   */
  const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    // OpenAI
    'gpt-5-mini':       { input: 0.30, output: 1.25 },
    'gpt-5-nano':       { input: 0.10, output: 0.40 },
    'gpt-4.1-mini':     { input: 0.40, output: 1.60 },
    'gpt-4.1-nano':     { input: 0.10, output: 0.40 },
    'gpt-4.1':          { input: 2.00, output: 8.00 },
    'gpt-4o':           { input: 2.50, output: 10.00 },
    'gpt-4o-mini':      { input: 0.15, output: 0.60 },
    'o3-mini':          { input: 1.10, output: 4.40 },
    // Embeddings
    'text-embedding-3-small': { input: 0.02, output: 0.00 },
    'text-embedding-3-large': { input: 0.13, output: 0.00 },
  };

  function estimateCost(run: AgentRun): number | null {
    if (!run.model || !run.tokensUsed) return null;
    const pricing = MODEL_PRICING[run.model];
    if (!pricing) {
      // Fallback: estimate with gpt-5-mini pricing
      const fallback = MODEL_PRICING['gpt-5-mini']!;
      const promptT = run.promptTokens ?? Math.round(run.tokensUsed * 0.7);
      const completionT = run.completionTokens ?? run.tokensUsed - promptT;
      return (promptT * fallback.input + completionT * fallback.output) / 1_000_000;
    }
    const promptT = run.promptTokens ?? Math.round(run.tokensUsed * 0.7);
    const completionT = run.completionTokens ?? run.tokensUsed - promptT;
    return (promptT * pricing.input + completionT * pricing.output) / 1_000_000;
  }

  function formatCost(cost: number | null): string {
    if (cost === null) return '—';
    if (cost < 0.001) return `$${(cost * 100).toFixed(4)}¢`;
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(3)}`;
  }

  const filteredRuns = $derived(() => {
    let filtered = runs;
    if (filterAgent !== 'all') {
      filtered = filtered.filter(r => r.agent === filterAgent);
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter(r => r.status === filterStatus);
    }
    return filtered;
  });

  const agents = $derived([...new Set(runs.map(r => r.agent))].sort());

  const stats = $derived(() => {
    const total = runs.length;
    const completed = runs.filter(r => r.status === 'completed').length;
    const failed = runs.filter(r => r.status === 'failed').length;
    const running = runs.filter(r => r.status === 'running').length;
    const totalTokens = runs.reduce((sum, r) => sum + (r.tokensUsed ?? 0), 0);
    const runsWithDuration = runs.filter(r => r.durationMs);
    const avgDuration = runsWithDuration.length > 0
      ? runsWithDuration.reduce((sum, r) => sum + (r.durationMs ?? 0), 0) / runsWithDuration.length
      : 0;
    const totalEstimatedCost = runs.reduce((sum, r) => sum + (estimateCost(r) ?? 0), 0);
    return { total, completed, failed, running, totalTokens, avgDuration, totalEstimatedCost };
  });

  async function loadData() {
    try {
      const res = await api.get<AgentRun[]>('/agent-runs');
      runs = res.data || [];
      error = '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load agent runs';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadData();
    refreshInterval = setInterval(() => {
      if (autoRefresh) loadData();
    }, 5000);
    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  });

  function toggleExpand(id: string) {
    expandedRunId = expandedRunId === id ? null : id;
  }

  function formatDate(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  function formatDuration(ms: number | undefined): string {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  function agentLabel(agent: string): string {
    const labels: Record<string, string> = {
      chat: '💬 Chat',
      summarizer: '📝 Summarizer',
      'rag-ingestor': '🔗 RAG Ingestor',
      crawler: '🕷️ Crawler',
      'quality-filter': '🔍 Quality Filter',
      pipeline: '⚙️ Pipeline',
    };
    return labels[agent] ?? agent;
  }

  function agentColor(agent: string): string {
    const colors: Record<string, string> = {
      chat: 'bg-blue-100 text-blue-700',
      summarizer: 'bg-purple-100 text-purple-700',
      'rag-ingestor': 'bg-teal-100 text-teal-700',
      crawler: 'bg-amber-100 text-amber-700',
      'quality-filter': 'bg-indigo-100 text-indigo-700',
      pipeline: 'bg-slate-100 text-slate-700',
    };
    return colors[agent] ?? 'bg-gray-100 text-gray-700';
  }

  const statusColors: Record<string, string> = {
    running: 'bg-cyan-100 text-cyan-700 animate-pulse',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };

  const statusIcons: Record<string, string> = {
    running: '⏳',
    completed: '✅',
    failed: '❌',
  };
</script>

<div>
  <!-- Header -->
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <h2 class="text-lg font-semibold text-text">Agent Runs Monitor</h2>
    <div class="flex items-center gap-3">
      <label class="flex items-center gap-1.5 text-xs text-text">
        <input type="checkbox" bind:checked={autoRefresh} class="rounded border-border" />
        Auto-refresh
      </label>
      <button
        onclick={() => loadData()}
        class="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text hover:bg-surface-dark"
      >
        ↻ Refresh
      </button>
    </div>
  </div>

  <!-- Stats cards -->
  {#if !loading && runs.length > 0}
    <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
      <div class="rounded-lg bg-surface p-3 text-center">
        <p class="text-2xl font-bold text-text">{stats().total}</p>
        <p class="text-xs font-medium text-text">Total Runs</p>
      </div>
      <div class="rounded-lg bg-surface p-3 text-center">
        <p class="text-2xl font-bold text-green-400">{stats().completed}</p>
        <p class="text-xs font-medium text-text">Completed</p>
      </div>
      <div class="rounded-lg bg-surface p-3 text-center">
        <p class="text-2xl font-bold text-red-400">{stats().failed}</p>
        <p class="text-xs font-medium text-text">Failed</p>
      </div>
      <div class="rounded-lg bg-surface p-3 text-center">
        <p class="text-2xl font-bold text-cyan-400">{stats().running}</p>
        <p class="text-xs font-medium text-text">Running</p>
      </div>
      <div class="rounded-lg bg-surface p-3 text-center">
        <p class="text-2xl font-bold text-text">{stats().totalTokens.toLocaleString()}</p>
        <p class="text-xs font-medium text-text">Total Tokens</p>
      </div>
      <div class="rounded-lg bg-surface p-3 text-center">
        <p class="text-2xl font-bold text-amber-400">{formatCost(stats().totalEstimatedCost)}</p>
        <p class="text-xs font-medium text-text">Est. Cost</p>
      </div>
      <div class="rounded-lg bg-surface p-3 text-center">
        <p class="text-2xl font-bold text-text">{formatDuration(stats().avgDuration)}</p>
        <p class="text-xs text-text-muted">Avg Duration</p>
      </div>
    </div>
  {/if}

  <!-- Filters -->
  <div class="mb-3 flex gap-2">
    <select
      bind:value={filterAgent}
      class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text"
    >
      <option value="all">All Agents</option>
      {#each agents as a}
        <option value={a}>{agentLabel(a)}</option>
      {/each}
    </select>
    <select
      bind:value={filterStatus}
      class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text"
    >
      <option value="all">All Statuses</option>
      <option value="running">⏳ Running</option>
      <option value="completed">✅ Completed</option>
      <option value="failed">❌ Failed</option>
    </select>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
    </div>
  {:else if error}
    <div class="flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-950/60 px-4 py-3 text-sm font-medium text-red-200">
      <span>⚠️</span>
      <span>{error}</span>
    </div>
  {:else if filteredRuns().length === 0}
    <div class="rounded-lg bg-surface p-12 text-center">
      <p class="text-4xl">🤖</p>
      <p class="mt-2 text-lg font-medium text-text-muted">No agent runs yet</p>
      <p class="mt-1 text-sm text-text-muted">
        Agent runs will appear here when you use the Chat or run the KB Pipeline.
      </p>
    </div>
  {:else}
    <div class="space-y-1.5">
      {#each filteredRuns() as run}
        <div class="rounded-lg bg-surface transition-colors">
          <!-- Run header row -->
          <button
            onclick={() => toggleExpand(run.id)}
            class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-dark/50"
          >
            <!-- Status icon -->
            <span class="text-base">{statusIcons[run.status] ?? '❓'}</span>

            <!-- Agent badge -->
            <span class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium {agentColor(run.agent)}">
              {agentLabel(run.agent)}
            </span>

            <!-- Status badge -->
            <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase {statusColors[run.status] ?? 'bg-gray-100 text-gray-700'}">
              {run.status}
            </span>

            <!-- Input summary -->
            <span class="min-w-0 flex-1 truncate text-xs text-text-muted" title={run.input}>
              {run.input}
            </span>

            <!-- Tokens -->
            {#if run.tokensUsed}
              <span class="shrink-0 text-xs text-text-muted">
                🔤 {run.tokensUsed.toLocaleString()}
              </span>
            {/if}

            <!-- Cost -->
            {#if estimateCost(run) !== null}
              <span class="shrink-0 text-xs text-amber-400">
                💰 {formatCost(estimateCost(run))}
              </span>
            {/if}

            <!-- Duration -->
            <span class="shrink-0 text-xs text-text-muted">
              ⏱ {formatDuration(run.durationMs)}
            </span>

            <!-- Time -->
            <span class="shrink-0 text-[10px] text-text-muted">{formatDate(run.createdAt)}</span>

            <!-- Expand arrow -->
            <span class="text-text-muted transition-transform {expandedRunId === run.id ? 'rotate-180' : ''}">
              ▾
            </span>
          </button>

          <!-- Expanded details -->
          {#if expandedRunId === run.id}
            <div class="border-t border-border/50 px-4 py-4">
              <div class="grid gap-4 lg:grid-cols-2">
                <!-- Left: structured info -->
                <div class="space-y-4">
                  <!-- Input -->
                  <div>
                    <h3 class="mb-1 text-xs font-semibold uppercase text-text">Input</h3>
                    <pre class="whitespace-pre-wrap rounded-lg bg-background p-3 text-xs text-text">{run.input}</pre>
                  </div>

                  <!-- Full Input (OpenAI messages) -->
                  {#if run.fullInput}
                    <div>
                      <h3 class="mb-1 text-xs font-semibold uppercase text-text">Full Input (OpenAI Messages)</h3>
                      <pre class="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-xs text-text">{(() => { try { return JSON.stringify(JSON.parse(run.fullInput), null, 2); } catch { return run.fullInput; } })()}</pre>
                    </div>
                  {/if}

                  <!-- Output -->
                  {#if run.output}
                    <div>
                      <h3 class="mb-1 text-xs font-semibold uppercase text-text">Output</h3>
                      <pre class="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-xs text-text">{run.output}</pre>
                    </div>
                  {/if}

                  <!-- Full Output (OpenAI Response) -->
                  {#if run.fullOutput}
                    <div>
                      <h3 class="mb-1 text-xs font-semibold uppercase text-text">Full Output (OpenAI Response)</h3>
                      <pre class="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-xs text-text">{(() => { try { return JSON.stringify(JSON.parse(run.fullOutput), null, 2); } catch { return run.fullOutput; } })()}</pre>
                    </div>
                  {/if}

                  <!-- Error -->
                  {#if run.error}
                    <div>
                      <h3 class="mb-1 text-xs font-semibold uppercase text-red-400">Error</h3>
                      <pre class="whitespace-pre-wrap rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-200">{run.error}</pre>
                    </div>
                  {/if}
                </div>

                <!-- Right: metadata -->
                <div class="space-y-4">
                  <div>
                    <h3 class="mb-1 text-xs font-semibold uppercase text-text">Details</h3>
                    <dl class="space-y-1.5 text-sm">
                      <div class="flex gap-2">
                        <dt class="w-24 shrink-0 text-text">Run ID</dt>
                        <dd class="break-all font-mono text-[10px] text-text">{run.id}</dd>
                      </div>
                      <div class="flex gap-2">
                        <dt class="w-24 shrink-0 text-text">Agent</dt>
                        <dd class="text-text">{agentLabel(run.agent)}</dd>
                      </div>
                      {#if run.model}
                        <div class="flex gap-2">
                          <dt class="w-24 shrink-0 text-text">Model</dt>
                          <dd class="text-text">{run.model}</dd>
                        </div>
                      {/if}
                      <div class="flex gap-2">
                        <dt class="w-24 shrink-0 text-text">Status</dt>
                        <dd class="text-text">{run.status}</dd>
                      </div>
                      {#if run.tokensUsed}
                        <div class="flex gap-2">
                          <dt class="w-24 shrink-0 text-text">Tokens</dt>
                          <dd class="text-text">{run.tokensUsed.toLocaleString()}</dd>
                        </div>
                      {/if}
                      {#if estimateCost(run) !== null}
                        <div class="flex gap-2">
                          <dt class="w-24 shrink-0 text-text">Est. Cost</dt>
                          <dd class="font-medium text-amber-400">{formatCost(estimateCost(run))}</dd>
                        </div>
                      {/if}
                      <div class="flex gap-2">
                        <dt class="w-24 shrink-0 text-text">Duration</dt>
                        <dd class="text-text">{formatDuration(run.durationMs)}</dd>
                      </div>
                      <div class="flex gap-2">
                        <dt class="w-24 shrink-0 text-text">Started</dt>
                        <dd class="text-text">{formatDate(run.createdAt)}</dd>
                      </div>
                      {#if run.completedAt}
                        <div class="flex gap-2">
                          <dt class="w-24 shrink-0 text-text">Completed</dt>
                          <dd class="text-text">{formatDate(run.completedAt)}</dd>
                        </div>
                      {/if}
                    </dl>
                  </div>

                  <!-- Metadata JSON -->
                  {#if run.metadata && Object.keys(run.metadata).length > 0}
                    <div>
                      <h3 class="mb-1 text-xs font-semibold uppercase text-text">Metadata</h3>
                      <pre class="max-h-48 overflow-auto rounded-lg bg-background p-3 text-[10px] text-text-muted">{JSON.stringify(run.metadata, null, 2)}</pre>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
