<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  interface SummaryContent {
    title: string;
    keyPoints: string[];
    dos: string[];
    donts: string[];
    tags: string[];
    difficulty: string;
    roleRelevance: { role: string; relevanceScore: number }[];
    citations: { text: string; sourceSection: string }[];
  }

  interface SummaryInfo {
    id: string;
    articleId: string;
    content: SummaryContent;
    model: string;
    promptVersion: string;
    tokensUsed: number;
    createdAt: string;
  }

  let summaries = $state<SummaryInfo[]>([]);
  let loading = $state(true);
  let search = $state('');
  let selectedDifficulty = $state<string>('all');
  let expandedId = $state<string | null>(null);
  let summarizing = $state(false);
  let summarizeMessage = $state('');

  const difficulties = $derived(
    ['all', ...new Set(summaries.map((s) => s.content.difficulty).filter(Boolean))],
  );

  const filteredSummaries = $derived(() => {
    let result = summaries;
    if (selectedDifficulty !== 'all') {
      result = result.filter((s) => s.content.difficulty === selectedDifficulty);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.content.title.toLowerCase().includes(q) ||
          s.content.tags.some((t) => t.toLowerCase().includes(q)) ||
          s.content.keyPoints.some((p) => p.toLowerCase().includes(q)),
      );
    }
    return result;
  });

  const totalTokens = $derived(summaries.reduce((sum, s) => sum + s.tokensUsed, 0));

  async function loadSummaries() {
    loading = true;
    try {
      const res = await api.get<SummaryInfo[]>('/workers/kb-builder/summaries');
      summaries = res.data || [];
    } catch {
      summaries = [];
    } finally {
      loading = false;
    }
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
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
      // Reload summaries after a short delay to show new ones
      setTimeout(() => loadSummaries(), 5000);
    } catch {
      summarizeMessage = 'Failed to start summarization — KB Builder may be offline.';
    } finally {
      summarizing = false;
    }
  }

  onMount(() => {
    loadSummaries();
  });
</script>

{#if loading}
  <div class="flex items-center justify-center py-12">
    <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
  </div>
{:else}
  <!-- Header -->
  <div class="mb-5 flex items-start justify-between">
    <div>
      <h2 class="text-lg font-semibold text-text">Summarization</h2>
      <p class="mt-1 max-w-2xl text-sm text-text-muted">
        AI-generated summaries from crawled knowledge base articles. These summaries power the KB Chat context.
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
        onclick={loadSummaries}
        class="rounded-md bg-surface px-3 py-1.5 text-xs font-medium text-text-muted ring-1 ring-border hover:text-text"
      >
        ↻ Reload
      </button>
    </div>
  </div>

  <!-- Summarization status message -->
  {#if summarizeMessage}
    <div class="mb-4 rounded-lg border px-4 py-2.5 text-sm {summarizeMessage.startsWith('Error') || summarizeMessage.startsWith('Failed') ? 'border-danger/30 bg-danger/5 text-danger' : 'border-success/30 bg-success/5 text-success'}">
      {summarizeMessage}
    </div>
  {/if}

  <!-- Stats bar -->
  <div class="mb-5 grid grid-cols-4 gap-3">
    <div class="rounded-lg bg-surface p-3 ring-1 ring-border/30">
      <p class="text-xs text-text">Total Summaries</p>
      <p class="mt-1 text-xl font-bold text-text">{summaries.length}</p>
    </div>
    <div class="rounded-lg bg-surface p-3 ring-1 ring-border/30">
      <p class="text-xs text-text">Total Tokens</p>
      <p class="mt-1 text-xl font-bold text-text">{totalTokens.toLocaleString()}</p>
    </div>
    <div class="rounded-lg bg-surface p-3 ring-1 ring-border/30">
      <p class="text-xs text-text">Unique Tags</p>
      <p class="mt-1 text-xl font-bold text-text">{new Set(summaries.flatMap((s) => s.content.tags)).size}</p>
    </div>
    <div class="rounded-lg bg-surface p-3 ring-1 ring-border/30">
      <p class="text-xs text-text">Model</p>
      <p class="mt-1 text-sm font-bold text-text">{summaries[0]?.model || '—'}</p>
    </div>
  </div>

  <!-- Filters -->
  <div class="mb-4 flex items-center gap-3">
    <input
      type="text"
      bind:value={search}
      placeholder="Search summaries by title, tag, or key point…"
      class="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted"
    />
    <select
      bind:value={selectedDifficulty}
      class="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
    >
      {#each difficulties as diff}
        <option value={diff}>{diff === 'all' ? 'All Difficulties' : diff}</option>
      {/each}
    </select>
  </div>

  <!-- Summary count -->
  <p class="mb-3 text-xs text-text-muted">
    Showing {filteredSummaries().length} of {summaries.length} summaries
  </p>

  <!-- Summary Cards -->
  {#if summaries.length === 0}
    <div class="rounded-lg bg-surface py-16 text-center ring-1 ring-border/30">
      <p class="text-lg font-medium text-text-muted">No summaries yet</p>
      <p class="mt-2 text-sm text-text-muted">
        Go to <a href="/settings/workers/kb-builder" class="text-primary hover:underline">KB Builder</a> and run the pipeline to generate AI summaries from crawled articles.
      </p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each filteredSummaries() as summary}
        <div class="rounded-lg bg-surface ring-1 ring-border/20 transition-shadow hover:ring-border/40">
          <!-- Collapsed header (always visible) -->
          <button
            onclick={() => toggleExpand(summary.id)}
            class="flex w-full items-start gap-3 p-4 text-left"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h4 class="text-sm font-medium text-text">{summary.content.title}</h4>
                <span class="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                  {summary.content.difficulty}
                </span>
              </div>
              <!-- Tags -->
              <div class="mt-1.5 flex flex-wrap gap-1">
                {#each summary.content.tags as tag}
                  <span class="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">{tag}</span>
                {/each}
              </div>
            </div>
            <span class="shrink-0 text-text-muted transition-transform {expandedId === summary.id ? 'rotate-180' : ''}">
              ▾
            </span>
          </button>

          <!-- Expanded content -->
          {#if expandedId === summary.id}
            <div class="border-t border-border/10 px-4 pb-4 pt-3">
              <!-- Key Points -->
              <div class="mb-3">
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
                <div class="mb-3 grid grid-cols-2 gap-3">
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
                <div class="mb-3">
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
          {/if}
        </div>
      {/each}
    </div>
  {/if}
{/if}
