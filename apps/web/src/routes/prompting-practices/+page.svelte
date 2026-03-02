<script lang="ts">
  import { promptingPractices } from '$lib/data/prompting-practices';

  let expandedId = $state<number | null>(null);
  let searchQuery = $state('');

  function toggle(id: number) {
    expandedId = expandedId === id ? null : id;
  }

  const filtered = $derived(
    searchQuery.trim()
      ? promptingPractices.filter(p =>
          p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.summary.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : promptingPractices
  );
</script>

<div class="mx-auto max-w-4xl">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-text">Prompting Practices</h1>
    <p class="mt-2 text-text-muted">
      {promptingPractices.length} proven practices with real examples — everything you need to get great results from AI.
    </p>
  </div>

  <!-- Search -->
  <div class="mb-6">
    <input
      type="text"
      placeholder="Search practices..."
      bind:value={searchQuery}
      class="w-full rounded-lg border border-border bg-surface px-4 py-3 text-text placeholder-text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
    />
  </div>

  {#if filtered.length === 0}
    <div class="rounded-xl bg-surface p-8 text-center text-text-muted">
      No practices match your search.
    </div>
  {/if}

  <!-- Practice Cards -->
  <div class="space-y-3">
    {#each filtered as practice (practice.id)}
      <div class="rounded-xl bg-surface shadow-sm ring-1 ring-border overflow-hidden">
        <!-- Header (always visible) -->
        <button
          onclick={() => toggle(practice.id)}
          class="flex w-full items-start gap-4 px-6 py-5 text-left transition-colors hover:bg-surface-dark"
        >
          <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {practice.id}
          </span>
          <div class="flex-1">
            <h2 class="text-lg font-semibold text-text">{practice.title}</h2>
            <p class="mt-1 text-sm text-text-muted">{practice.summary}</p>
          </div>
          <span class="mt-1 text-text-faint transition-transform {expandedId === practice.id ? 'rotate-180' : ''}">
            ▼
          </span>
        </button>

        <!-- Expanded content -->
        {#if expandedId === practice.id}
          <div class="border-t border-border px-6 pb-6 pt-4">
            <!-- Why it works -->
            <div class="mb-5 rounded-lg bg-primary/5 p-4">
              <h3 class="mb-1 text-sm font-semibold text-primary">💡 Why This Works</h3>
              <p class="text-sm text-text-muted">{practice.why}</p>
            </div>

            <!-- Examples -->
            {#each practice.examples as example, i}
              <div class="mb-4 last:mb-0">
                {#if practice.examples.length > 1}
                  <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-text-faint">
                    Example {i + 1}
                  </h4>
                {/if}

                <!-- Bad example -->
                <div class="mb-2 rounded-lg border border-danger/20 bg-danger/5 p-4">
                  <div class="mb-1 flex items-center gap-2 text-xs font-semibold text-danger">
                    ❌ Don't do this
                  </div>
                  <p class="text-sm text-text">{example.bad}</p>
                </div>

                <!-- Good example -->
                <div class="mb-2 rounded-lg border border-success/20 bg-success/5 p-4">
                  <div class="mb-1 flex items-center gap-2 text-xs font-semibold text-success">
                    ✅ Do this instead
                  </div>
                  <p class="whitespace-pre-line text-sm text-text">{example.good}</p>
                </div>

                <!-- Why it's better -->
                <div class="rounded-lg bg-surface-dark p-3">
                  <p class="text-xs text-text-muted">
                    <span class="font-semibold">Why it's better:</span> {example.whyBetter}
                  </p>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
