<script lang="ts">
  import { api } from '$lib/api';
  import { onMount } from 'svelte';

  // ── Types ──

  interface CrawlSource {
    id: string;
    url: string;
    name: string;
    enabled: boolean;
    maxPages: number;
    addedAt: string;
  }

  interface CrawlProgress {
    status: 'idle' | 'running' | 'completed' | 'failed';
    source: string;
    totalLinksFound: number;
    totalProcessed: number;
    totalNew: number;
    totalSkipped: number;
    errors: string[];
    startedAt: string | null;
    completedAt: string | null;
    totalArticlesStored?: number;
  }

  interface PipelineStageResult {
    status: string;
    result?: {
      passed?: number;
      failed?: number;
      summarized?: number;
      skipped?: number;
      ingested?: number;
      errors?: string[];
      totalTokensUsed?: number;
    };
  }

  interface PipelineProgress {
    status: 'idle' | 'running' | 'completed' | 'failed';
    currentStage: string;
    stages: {
      qualityFilter: PipelineStageResult;
      summarization: PipelineStageResult;
      ingestion: PipelineStageResult;
    };
    startedAt: string | null;
    completedAt: string | null;
    error?: string;
  }

  interface ArticleInfo {
    id: string;
    url: string;
    title: string;
    source: string;
    status: string;
    fetchedAt: string;
    metadata: {
      wordCount: number;
      language: string;
      author?: string;
      publishedAt?: string;
    };
  }

  interface SummaryInfo {
    id: string;
    articleId: string;
    version: number;
    content: {
      title: string;
      keyPoints: string[];
      dos: string[];
      donts: string[];
      tags: string[];
      difficulty: string;
      roleRelevance: { role: string; relevanceScore: number }[];
      citations: { text: string; sourceSection: string }[];
    };
    model: string;
    promptVersion: string;
    tokensUsed: number;
    createdAt: string;
  }

  interface LogEntry {
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    data?: Record<string, unknown>;
  }

  // ── State ──

  let sources = $state<CrawlSource[]>([]);
  let progress = $state<CrawlProgress | null>(null);
  let pipelineProgress = $state<PipelineProgress | null>(null);
  let articles = $state<ArticleInfo[]>([]);
  let summaries = $state<SummaryInfo[]>([]);
  let logs = $state<LogEntry[]>([]);
  let loading = $state(true);
  let crawling = $state(false);
  let pipelining = $state(false);
  let refreshInterval: ReturnType<typeof setInterval> | undefined;
  let triggerResult = $state<string | null>(null);
  let pipelineTriggerResult = $state<string | null>(null);

  // SSE
  let eventSource: EventSource | null = null;
  let sseConnected = $state(false);
  let logAutoScroll = $state(true);
  let logPanelEl: HTMLDivElement | undefined = $state();

  // Add source form
  let newSourceUrl = $state('');
  let newSourceName = $state('');
  let newSourceMaxPages = $state(100);
  let showAddForm = $state(false);

  // Article filter
  let articleSearch = $state('');

  // Active tab in right panel
  let activeTab = $state<'logs' | 'articles' | 'summaries'>('logs');

  const filteredArticles = $derived(
    articleSearch.trim()
      ? articles.filter(
          (a) =>
            a.title.toLowerCase().includes(articleSearch.toLowerCase()) ||
            a.url.toLowerCase().includes(articleSearch.toLowerCase()),
        )
      : articles,
  );

  // ── SSE Log Streaming ──

  const API_BASE = import.meta.env.VITE_API_URL || '/api';

  function connectSSE() {
    if (eventSource) return; // already connected
    eventSource = new EventSource(`${API_BASE}/workers/kb-builder/logs/stream`);
    sseConnected = true;

    eventSource.onmessage = (event) => {
      try {
        const entry: LogEntry = JSON.parse(event.data);
        logs = [...logs, entry];

        // Auto-scroll log panel
        if (logAutoScroll && logPanelEl) {
          requestAnimationFrame(() => {
            if (logPanelEl) logPanelEl.scrollTop = logPanelEl.scrollHeight;
          });
        }

        // Update progress from log data for real-time feel
        if (entry.level === 'info' && entry.message.includes('Crawl completed')) {
          crawling = false;
          loadArticles();
          loadProgress();
        }
        if (entry.level === 'error' && entry.message.includes('Fatal crawl error')) {
          crawling = false;
          loadProgress();
        }
        // Detect pipeline events
        if (entry.level === 'info' && entry.message.includes('Pipeline completed')) {
          pipelining = false;
          loadPipelineProgress();
          loadSummaries();
          loadArticles();
        }
        if (entry.level === 'error' && entry.message.includes('Pipeline failed')) {
          pipelining = false;
          loadPipelineProgress();
        }
        if (entry.level === 'info' && (entry.message.includes('Quality filter') || entry.message.includes('Summariz') || entry.message.includes('Ingestion'))) {
          loadPipelineProgress();
        }
      } catch {
        // ignore malformed events
      }
    };

    eventSource.onerror = () => {
      sseConnected = false;
      disconnectSSE();
      // Try to reconnect after 3 seconds
      setTimeout(() => {
        if (crawling) connectSSE();
      }, 3000);
    };
  }

  function disconnectSSE() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
      sseConnected = false;
    }
  }

  // ── API Calls ──

  async function loadSources() {
    try {
      const res = await api.get<CrawlSource[]>('/workers/kb-builder/sources');
      sources = res.data || [];
    } catch {
      sources = [];
    }
  }

  async function loadProgress() {
    try {
      const res = await api.get<CrawlProgress>('/workers/kb-builder/progress');
      const p = res.data;
      if (p) {
        progress = p;
        const wasRunning = crawling;
        crawling = p.status === 'running';
        // Auto-connect SSE when crawling
        if (crawling && !eventSource) connectSSE();
        // Reload articles when done
        if (wasRunning && !crawling) loadArticles();
      }
    } catch {
      // ignore
    }
  }

  async function loadArticles() {
    try {
      const res = await api.get<ArticleInfo[]>('/workers/kb-builder/articles');
      articles = res.data || [];
    } catch {
      articles = [];
    }
  }

  async function loadPipelineProgress() {
    try {
      const res = await api.get<PipelineProgress>('/workers/kb-builder/pipeline/progress');
      const p = res.data;
      if (p) {
        pipelineProgress = p;
        const wasRunning = pipelining;
        pipelining = p.status === 'running';
        if (pipelining && !eventSource) connectSSE();
        if (wasRunning && !pipelining) {
          loadSummaries();
          loadArticles();
        }
      }
    } catch {
      // ignore
    }
  }

  async function loadSummaries() {
    try {
      const res = await api.get<SummaryInfo[]>('/workers/kb-builder/summaries');
      summaries = res.data || [];
    } catch {
      summaries = [];
    }
  }

  async function loadAll() {
    loading = true;
    await Promise.all([loadSources(), loadProgress(), loadArticles(), loadPipelineProgress(), loadSummaries()]);
    // If a crawl or pipeline is already running, connect SSE
    if (crawling || pipelining) connectSSE();
    loading = false;
  }

  onMount(() => {
    loadAll();
    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
      disconnectSSE();
    };
  });

  // Poll progress while crawling or pipelining (backup for SSE / to update counters)
  $effect(() => {
    if (refreshInterval) clearInterval(refreshInterval);
    if (crawling || pipelining) {
      refreshInterval = setInterval(() => {
        loadProgress();
        if (pipelining) loadPipelineProgress();
      }, 3000);
    }
  });

  async function triggerCrawl() {
    crawling = true;
    triggerResult = null;
    logs = []; // clear log buffer for fresh crawl
    activeTab = 'logs';
    try {
      const res = await api.post<Record<string, unknown>>('/workers/kb-builder/trigger');
      triggerResult = JSON.stringify(res.data, null, 2);
      connectSSE();
    } catch (err) {
      triggerResult = `Error: ${err instanceof Error ? err.message : 'Unknown'}`;
      crawling = false;
    }
  }

  async function triggerPipeline() {
    pipelining = true;
    pipelineTriggerResult = null;
    activeTab = 'logs';
    try {
      const res = await api.post<Record<string, unknown>>('/workers/kb-builder/pipeline');
      pipelineTriggerResult = JSON.stringify(res.data, null, 2);
      connectSSE();
    } catch (err) {
      pipelineTriggerResult = `Error: ${err instanceof Error ? err.message : 'Unknown'}`;
      pipelining = false;
    }
  }

  async function addSource() {
    if (!newSourceUrl.trim() || !newSourceName.trim()) return;
    await api.post('/workers/kb-builder/sources', {
      url: newSourceUrl.trim(),
      name: newSourceName.trim(),
      maxPages: newSourceMaxPages,
      enabled: true,
    });
    newSourceUrl = '';
    newSourceName = '';
    newSourceMaxPages = 100;
    showAddForm = false;
    await loadSources();
  }

  async function toggleSource(source: CrawlSource) {
    await api.patch(`/workers/kb-builder/sources/${source.id}`, {
      enabled: !source.enabled,
    });
    await loadSources();
  }

  async function deleteSource(id: string) {
    await api.delete(`/workers/kb-builder/sources/${id}`);
    await loadSources();
  }

  function clearLogs() {
    logs = [];
  }

  function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
  }

  function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  const statusBadge: Record<string, string> = {
    fetched: 'bg-blue-500/20 text-blue-300',
    extracted: 'bg-cyan-500/20 text-cyan-300',
    deduped: 'bg-purple-500/20 text-purple-300',
    quality_passed: 'bg-green-500/20 text-green-300',
    quality_failed: 'bg-red-500/20 text-red-300',
    summarized: 'bg-emerald-500/20 text-emerald-300',
    ingested: 'bg-teal-500/20 text-teal-300',
    rejected: 'bg-red-500/20 text-red-300',
  };

  const logLevelColors: Record<string, string> = {
    info: 'text-blue-300',
    warn: 'text-yellow-300',
    error: 'text-red-300',
    debug: 'text-gray-400',
  };

  const logLevelBadgeColors: Record<string, string> = {
    info: 'bg-blue-500/20 text-blue-300',
    warn: 'bg-yellow-500/20 text-yellow-300',
    error: 'bg-red-500/20 text-red-300',
    debug: 'bg-gray-500/20 text-gray-400',
  };
</script>

{#if loading}
  <div class="flex items-center justify-center py-12">
    <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
  </div>
{:else}
  <!-- Header -->
  <div class="mb-5 flex items-start justify-between">
    <div>
      <h2 class="text-lg font-semibold text-text">KB Builder</h2>
      <p class="mt-1 max-w-2xl text-sm text-text-muted">
        Crawls configured sources, extracts article content, and stores them for the knowledge base.
      </p>
    </div>
    <div class="flex items-center gap-3">
      {#if sseConnected}
        <span class="flex items-center gap-1 text-xs text-green-400">
          <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400"></span>
          Live
        </span>
      {/if}
    </div>
  </div>

  <div class="grid gap-5 lg:grid-cols-3">
    <!-- ═══ Left Column: Triggers → Progress → Sources ═══ -->
    <div class="space-y-5">

      <!-- Action Buttons -->
      <div class="rounded-lg bg-surface p-4">
        <h3 class="mb-3 text-xs font-semibold uppercase text-text">Actions</h3>
        <div>
          <button
            onclick={triggerCrawl}
            disabled={crawling}
            class="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white hover:bg-primary/80 disabled:opacity-50"
          >
            {crawling ? '⏳ Crawling…' : '🚀 Start Crawl'}
          </button>
        </div>
        {#if triggerResult}
          <pre class="mt-3 max-h-24 overflow-auto rounded bg-background p-2 text-xs text-text-muted">{triggerResult}</pre>
        {/if}
      </div>

      <!-- Crawl Progress -->
      {#if progress && progress.status !== 'idle'}
        <div class="rounded-lg bg-surface p-4">
          <h3 class="mb-3 text-xs font-semibold uppercase text-text">Crawl Progress</h3>
          <div class="space-y-2 text-xs">
            <div class="flex justify-between">
              <span class="text-text">Status</span>
              <span
                class="rounded-full px-2 py-0.5 font-medium
                  {progress.status === 'running'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : progress.status === 'completed'
                      ? 'bg-green-500/20 text-green-300'
                      : progress.status === 'failed'
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-gray-500/20 text-gray-300'}"
              >
                {progress.status}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-text">Source</span>
              <span class="text-text">{progress.source || '—'}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text">Links found</span>
              <span class="text-text">{progress.totalLinksFound}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text">Processed</span>
              <span class="text-text">{progress.totalProcessed} / {progress.totalLinksFound}</span>
            </div>

            {#if progress.totalLinksFound > 0}
              <div class="h-2 overflow-hidden rounded-full bg-surface-dark">
                <div
                  class="h-full rounded-full bg-primary transition-all duration-300"
                  style="width: {Math.round((progress.totalProcessed / progress.totalLinksFound) * 100)}%"
                ></div>
              </div>
            {/if}

            <div class="flex justify-between">
              <span class="text-text">New articles</span>
              <span class="font-medium text-green-300">{progress.totalNew}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text">Skipped</span>
              <span class="text-yellow-300">{progress.totalSkipped}</span>
            </div>
            {#if progress.errors.length > 0}
              <div class="flex justify-between">
                <span class="text-text-muted">Errors</span>
                <span class="text-red-300">{progress.errors.length}</span>
              </div>
            {/if}
            <div class="flex justify-between">
              <span class="text-text-muted">Started</span>
              <span class="text-text">{formatDate(progress.startedAt)}</span>
            </div>
            {#if progress.completedAt}
              <div class="flex justify-between">
                <span class="text-text-muted">Completed</span>
                <span class="text-text">{formatDate(progress.completedAt)}</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Pipeline Progress -->
      {#if pipelineProgress && pipelineProgress.status !== 'idle'}
        <div class="rounded-lg bg-surface p-4">
          <h3 class="mb-3 text-xs font-semibold uppercase text-text">Pipeline Progress</h3>
          <div class="space-y-2 text-xs">
            <div class="flex justify-between">
              <span class="text-text">Status</span>
              <span
                class="rounded-full px-2 py-0.5 font-medium
                  {pipelineProgress.status === 'running'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : pipelineProgress.status === 'completed'
                      ? 'bg-green-500/20 text-green-300'
                      : pipelineProgress.status === 'failed'
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-gray-500/20 text-gray-300'}"
              >
                {pipelineProgress.status}
              </span>
            </div>
            {#if pipelineProgress.currentStage}
              <div class="flex justify-between">
                <span class="text-text-muted">Current stage</span>
                <span class="text-text">{pipelineProgress.currentStage}</span>
              </div>
            {/if}

            <!-- Stage progress indicators -->
            {#each [
              { key: 'qualityFilter', label: 'Quality Filter', icon: '🔍' },
              { key: 'summarization', label: 'Summarization', icon: '🤖' },
              { key: 'ingestion', label: 'Ingestion', icon: '📦' },
            ] as stage}
              {@const s = pipelineProgress.stages[stage.key as keyof typeof pipelineProgress.stages]}
              <div class="rounded-md bg-surface-dark/50 px-3 py-2">
                <div class="flex items-center justify-between">
                  <span class="text-text">
                    {stage.icon} {stage.label}
                  </span>
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-medium
                      {s.status === 'running'
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : s.status === 'done'
                          ? 'bg-green-500/20 text-green-300'
                          : s.status === 'skipped'
                            ? 'bg-yellow-500/20 text-yellow-300'
                            : s.status === 'failed'
                              ? 'bg-red-500/20 text-red-300'
                              : 'bg-gray-500/20 text-gray-400'}"
                  >
                    {s.status}
                  </span>
                </div>
                {#if s.result}
                  <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-muted">
                    {#if s.result.passed !== undefined}
                      <span>✔ {s.result.passed} passed</span>
                    {/if}
                    {#if s.result.failed !== undefined}
                      <span>✘ {s.result.failed} failed</span>
                    {/if}
                    {#if s.result.summarized !== undefined}
                      <span>✔ {s.result.summarized} summarized</span>
                    {/if}
                    {#if s.result.ingested !== undefined}
                      <span>✔ {s.result.ingested} ingested</span>
                    {/if}
                    {#if s.result.skipped !== undefined && s.result.skipped > 0}
                      <span>⏭ {s.result.skipped} skipped</span>
                    {/if}
                    {#if s.result.totalTokensUsed}
                      <span>🔤 {s.result.totalTokensUsed.toLocaleString()} tokens</span>
                    {/if}
                    {#if s.result.errors && s.result.errors.length > 0}
                      <span class="text-red-400">⚠ {s.result.errors.length} errors</span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}

            <div class="flex justify-between">
              <span class="text-text-muted">Started</span>
              <span class="text-text">{formatDate(pipelineProgress.startedAt)}</span>
            </div>
            {#if pipelineProgress.completedAt}
              <div class="flex justify-between">
                <span class="text-text-muted">Completed</span>
                <span class="text-text">{formatDate(pipelineProgress.completedAt)}</span>
              </div>
            {/if}
            {#if pipelineProgress.error}
              <div class="rounded-md bg-red-950/30 px-3 py-2 text-red-300">
                {pipelineProgress.error}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Crawl Sources -->
      <div class="rounded-lg bg-surface p-4">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-xs font-semibold uppercase text-text">
            Crawl Sources
            <span class="ml-1 rounded-full bg-surface-dark px-1.5 py-0.5 text-[10px] text-text">{sources.length}</span>
          </h3>
          <button
            onclick={() => { showAddForm = !showAddForm; }}
            class="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
          >
            {showAddForm ? '✕ Cancel' : '+ Add Source'}
          </button>
        </div>

        {#if showAddForm}
          <div class="mb-3 space-y-2 rounded-md border border-border p-3">
            <div>
              <label for="source-name" class="mb-1 block text-xs text-text">Name</label>
              <input
                id="source-name"
                type="text"
                bind:value={newSourceName}
                placeholder="e.g. Simon Willison's Blog"
                class="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text"
              />
            </div>
            <div>
              <label for="source-url" class="mb-1 block text-xs text-text">URL</label>
              <input
                id="source-url"
                type="url"
                bind:value={newSourceUrl}
                placeholder="https://simonwillison.net/"
                class="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text"
              />
            </div>
            <div>
              <label for="source-max" class="mb-1 block text-xs text-text">Max pages</label>
              <input
                id="source-max"
                type="number"
                bind:value={newSourceMaxPages}
                min="1"
                max="1000"
                class="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text"
              />
            </div>
            <button
              onclick={addSource}
              class="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/80"
            >
              Add Source
            </button>
          </div>
        {/if}

        {#if sources.length === 0}
          <p class="py-4 text-center text-xs text-text-muted">No sources configured</p>
        {:else}
          <div class="max-h-[400px] space-y-2 overflow-y-auto pr-1">
            {#each sources as source}
              <div class="flex items-center gap-2 rounded-md bg-surface-dark/50 px-3 py-2">
                <button
                  onclick={() => toggleSource(source)}
                  class="text-lg leading-none {source.enabled ? 'text-green-400' : 'text-gray-500'}"
                  title={source.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                >
                  {source.enabled ? '●' : '○'}
                </button>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-xs font-medium text-text">{source.name}</p>
                  <p class="truncate text-xs text-text-muted">{source.url}</p>
                </div>
                <span class="shrink-0 text-xs text-text-muted">max {source.maxPages}</span>
                <button
                  onclick={() => deleteSource(source.id)}
                  class="shrink-0 text-xs text-red-400 hover:text-red-300"
                  title="Remove source"
                >
                  ✕
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- ═══ Right Column: Logs + Articles (tabbed) ═══ -->
    <div class="lg:col-span-2">
      <!-- Tab bar -->
      <div class="mb-3 flex items-center gap-1 border-b border-border/30">
        <button
          onclick={() => { activeTab = 'logs'; }}
          class="relative px-3 py-2 text-xs font-medium transition-colors
            {activeTab === 'logs' ? 'text-primary' : 'text-text-muted hover:text-text'}"
        >
          Live Logs
          {#if logs.length > 0}
            <span class="ml-1 rounded-full bg-surface-dark px-1.5 py-0.5 text-[10px] text-text-muted">{logs.length}</span>
          {/if}
          {#if activeTab === 'logs'}
            <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
          {/if}
        </button>
        <button
          onclick={() => { activeTab = 'articles'; }}
          class="relative px-3 py-2 text-xs font-medium transition-colors
            {activeTab === 'articles' ? 'text-primary' : 'text-text-muted hover:text-text'}"
        >
          Crawled Articles
          {#if articles.length > 0}
            <span class="ml-1 rounded-full bg-surface-dark px-1.5 py-0.5 text-[10px] text-text-muted">{articles.length}</span>
          {/if}
          {#if activeTab === 'articles'}
            <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
          {/if}
        </button>
        <button
          onclick={() => { activeTab = 'summaries'; }}
          class="relative px-3 py-2 text-xs font-medium transition-colors
            {activeTab === 'summaries' ? 'text-primary' : 'text-text-muted hover:text-text'}"
        >
          Summaries
          {#if summaries.length > 0}
            <span class="ml-1 rounded-full bg-surface-dark px-1.5 py-0.5 text-[10px] text-text-muted">{summaries.length}</span>
          {/if}
          {#if activeTab === 'summaries'}
            <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
          {/if}
        </button>
      </div>

      <!-- ═══ Live Logs Panel ═══ -->
      {#if activeTab === 'logs'}
        <div class="rounded-lg bg-surface p-4">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-xs font-semibold uppercase text-text">
              Crawl Logs
              {#if crawling}
                <span class="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-400"></span>
              {/if}
            </h3>
            <div class="flex items-center gap-2">
              <label class="flex items-center gap-1 text-[10px] text-text">
                <input type="checkbox" bind:checked={logAutoScroll} class="rounded" />
                Auto-scroll
              </label>
              <button
                onclick={clearLogs}
                class="rounded-md bg-surface-dark px-2 py-1 text-[10px] text-text-muted hover:text-text"
              >
                Clear
              </button>
              {#if !sseConnected}
                <button
                  onclick={connectSSE}
                  class="rounded-md bg-primary/20 px-2 py-1 text-[10px] text-primary hover:bg-primary/30"
                >
                  Connect
                </button>
              {:else}
                <button
                  onclick={disconnectSSE}
                  class="rounded-md bg-red-500/20 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/30"
                >
                  Disconnect
                </button>
              {/if}
            </div>
          </div>

          <div
            bind:this={logPanelEl}
            class="h-[500px] overflow-auto rounded-md bg-gray-950 p-3 font-mono text-[11px] leading-relaxed"
          >
            {#if logs.length === 0}
              <div class="flex h-full items-center justify-center">
                <p class="text-sm text-gray-500">
                  {sseConnected
                    ? 'Waiting for log events… Start a crawl to see live output.'
                    : 'Not connected. Click "Connect" or start a crawl to see live logs.'}
                </p>
              </div>
            {:else}
              {#each logs as entry, i}
                <div class="flex gap-2 py-0.5 hover:bg-white/5 {entry.level === 'error' ? 'bg-red-950/30' : ''}">
                  <span class="shrink-0 text-gray-600">{formatTime(entry.timestamp)}</span>
                  <span class="shrink-0 w-10 text-right uppercase {logLevelColors[entry.level] || 'text-gray-400'}">
                    {entry.level}
                  </span>
                  <span class="min-w-0 {logLevelColors[entry.level] || 'text-gray-300'}">
                    {entry.message}
                    {#if entry.data && Object.keys(entry.data).length > 0}
                      <span class="ml-1 text-gray-600">
                        {#each Object.entries(entry.data) as [key, val]}
                          <span class="ml-1">{key}=<span class="text-gray-400">{typeof val === 'string' ? truncate(val, 40) : JSON.stringify(val)}</span></span>
                        {/each}
                      </span>
                    {/if}
                  </span>
                </div>
              {/each}
            {/if}
          </div>

          <!-- Log stats bar -->
          <div class="mt-2 flex items-center gap-4 text-[10px] text-text-muted">
            <span>{logs.length} entries</span>
            <span class="text-blue-300">{logs.filter((l) => l.level === 'info').length} info</span>
            <span class="text-yellow-300">{logs.filter((l) => l.level === 'warn').length} warn</span>
            <span class="text-red-300">{logs.filter((l) => l.level === 'error').length} error</span>
            <span class="text-gray-400">{logs.filter((l) => l.level === 'debug').length} debug</span>
          </div>
        </div>
      {/if}

      <!-- ═══ Articles Table ═══ -->
      {#if activeTab === 'articles'}
        <div class="rounded-lg bg-surface p-4">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-xs font-semibold uppercase text-text">
              Crawled Articles
              <span class="ml-1 rounded-full bg-surface-dark px-2 py-0.5 text-text">{articles.length}</span>
            </h3>
            <div class="flex items-center gap-2">
              <input
                type="text"
                bind:value={articleSearch}
                placeholder="Search articles…"
                class="rounded-md border border-border bg-background px-2 py-1 text-xs text-text placeholder:text-text-muted"
              />
              <button
                onclick={loadArticles}
                class="rounded-md bg-surface-dark px-2 py-1 text-xs text-text-muted hover:text-text"
              >
                ↻ Reload
              </button>
            </div>
          </div>

          {#if filteredArticles.length === 0}
            <div class="py-12 text-center">
              <p class="text-sm text-text-muted">
                {articles.length === 0
                  ? 'No articles crawled yet. Configure sources and trigger a crawl.'
                  : 'No articles match your search.'}
              </p>
            </div>
          {:else}
            <div class="max-h-[500px] overflow-auto">
              <table class="w-full text-xs">
                <thead class="sticky top-0 bg-surface">
                  <tr class="border-b border-border/30 text-left text-text">
                    <th class="px-2 py-2 font-medium">Title</th>
                    <th class="px-2 py-2 font-medium">Source</th>
                    <th class="px-2 py-2 font-medium">Status</th>
                    <th class="px-2 py-2 font-medium text-right">Words</th>
                    <th class="px-2 py-2 font-medium">Crawled</th>
                  </tr>
                </thead>
                <tbody>
                  {#each filteredArticles as article}
                    <tr class="border-b border-border/10 hover:bg-surface-dark/30 transition-colors">
                      <td class="max-w-xs px-2 py-2">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-primary hover:underline"
                          title={article.url}
                        >
                          {truncate(article.title, 60)}
                        </a>
                      </td>
                      <td class="px-2 py-2 text-text-muted">{article.source}</td>
                      <td class="px-2 py-2">
                        <span class="rounded-full px-2 py-0.5 text-xs font-medium {statusBadge[article.status] || 'bg-gray-500/20 text-gray-300'}">
                          {article.status}
                        </span>
                      </td>
                      <td class="px-2 py-2 text-right text-text-muted">{article.metadata.wordCount.toLocaleString()}</td>
                      <td class="px-2 py-2 text-text-muted">{formatDate(article.fetchedAt)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      {/if}

      <!-- ═══ Summaries Panel ═══ -->
      {#if activeTab === 'summaries'}
        <div class="rounded-lg bg-surface p-4">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-xs font-semibold uppercase text-text">
              AI Summaries
              <span class="ml-1 rounded-full bg-surface-dark px-2 py-0.5 text-text">{summaries.length}</span>
            </h3>
            <button
              onclick={loadSummaries}
              class="rounded-md bg-surface-dark px-2 py-1 text-xs text-text-muted hover:text-text"
            >
              ↻ Reload
            </button>
          </div>

          {#if summaries.length === 0}
            <div class="py-12 text-center">
              <p class="text-sm text-text-muted">
                No summaries yet. Run the pipeline to generate AI summaries from crawled articles.
              </p>
            </div>
          {:else}
            <div class="max-h-[600px] space-y-3 overflow-auto">
              {#each summaries as summary}
                <div class="rounded-md border border-border/20 bg-surface-dark/30 p-3">
                  <!-- Header -->
                  <div class="mb-2 flex items-start justify-between gap-2">
                    <h4 class="text-sm font-medium text-text">{summary.content.title}</h4>
                    <span class="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                      {summary.content.difficulty}
                    </span>
                  </div>

                  <!-- Tags -->
                  <div class="mb-2 flex flex-wrap gap-1">
                    {#each summary.content.tags as tag}
                      <span class="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">{tag}</span>
                    {/each}
                  </div>

                  <!-- Key Points -->
                  <div class="mb-2">
                    <p class="mb-1 text-[10px] font-semibold uppercase text-text">Key Points</p>
                    <ul class="space-y-0.5 text-xs text-text-muted">
                      {#each summary.content.keyPoints as point}
                        <li class="flex gap-1.5">
                          <span class="mt-0.5 shrink-0 text-green-400">•</span>
                          <span>{point}</span>
                        </li>
                      {/each}
                    </ul>
                  </div>

                  <!-- Dos & Donts side by side -->
                  {#if summary.content.dos.length > 0 || summary.content.donts.length > 0}
                    <div class="mb-2 grid grid-cols-2 gap-2">
                      {#if summary.content.dos.length > 0}
                        <div>
                          <p class="mb-1 text-[10px] font-semibold uppercase text-green-400">Do</p>
                          <ul class="space-y-0.5 text-[11px] text-text-muted">
                            {#each summary.content.dos as item}
                              <li class="flex gap-1">
                                <span class="shrink-0 text-green-400">✓</span>
                                <span>{item}</span>
                              </li>
                            {/each}
                          </ul>
                        </div>
                      {/if}
                      {#if summary.content.donts.length > 0}
                        <div>
                          <p class="mb-1 text-[10px] font-semibold uppercase text-red-400">Don't</p>
                          <ul class="space-y-0.5 text-[11px] text-text-muted">
                            {#each summary.content.donts as item}
                              <li class="flex gap-1">
                                <span class="shrink-0 text-red-400">✗</span>
                                <span>{item}</span>
                              </li>
                            {/each}
                          </ul>
                        </div>
                      {/if}
                    </div>
                  {/if}

                  <!-- Role Relevance -->
                  {#if summary.content.roleRelevance.length > 0}
                    <div class="mb-2">
                      <p class="mb-1 text-[10px] font-semibold uppercase text-text">Role Relevance</p>
                      <div class="flex flex-wrap gap-1.5">
                        {#each summary.content.roleRelevance as rr}
                          <div class="flex items-center gap-1 rounded-full bg-surface-dark px-2 py-0.5 text-[10px]">
                            <span class="text-text-muted">{rr.role}</span>
                            <div class="h-1 w-8 overflow-hidden rounded-full bg-gray-700">
                              <div
                                class="h-full rounded-full bg-primary"
                                style="width: {rr.relevanceScore * 100}%"
                              ></div>
                            </div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  <!-- Meta -->
                  <div class="flex items-center gap-3 border-t border-border/10 pt-2 text-[10px] text-text-muted">
                    <span>🤖 {summary.model}</span>
                    <span>v{summary.promptVersion}</span>
                    <span>🔤 {summary.tokensUsed.toLocaleString()} tokens</span>
                    <span>{formatDate(summary.createdAt)}</span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
