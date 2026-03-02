<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte';
  import { api } from '$lib/api';
  import { promptingPractices } from '$lib/data/prompting-practices';
  import { comfortLevelFromPractices, TOTAL_PRACTICES } from '@aijourney/shared';

  let profile = $state<any>(null);
  let loading = $state(true);
  let saving = $state(false);
  let showCelebration = $state(false);

  const completedPractices = $derived<number[]>(profile?.preferences?.completedPractices ?? []);
  const completedCount = $derived(completedPractices.length);
  const allDone = $derived(completedCount >= TOTAL_PRACTICES);
  const comfortLevel = $derived(comfortLevelFromPractices(completedCount));
  const progressPercent = $derived(Math.round((completedCount / TOTAL_PRACTICES) * 100));

  // Find the next uncompleted practice (in order)
  const nextPractice = $derived(
    promptingPractices.find(p => !completedPractices.includes(p.id)) ?? null
  );

  $effect(() => {
    if (auth.user) loadProfile();
  });

  async function loadProfile() {
    try {
      const res = await api.get(`/users/${auth.user?.userId}`);
      profile = res.data;
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      loading = false;
    }
  }

  async function markComplete(practiceId: number) {
    if (saving || completedPractices.includes(practiceId)) return;
    saving = true;

    try {
      const updated = [...completedPractices, practiceId];
      const newComfort = comfortLevelFromPractices(updated.length);

      await api.patch(`/users/${auth.user?.userId}`, {
        preferences: {
          ...profile.preferences,
          completedPractices: updated,
          comfortLevel: newComfort,
        },
      });

      // Refresh profile
      const res = await api.get(`/users/${auth.user?.userId}`);
      profile = res.data;

      // Show celebration if all done
      if (updated.length >= TOTAL_PRACTICES) {
        showCelebration = true;
      }
    } catch (err) {
      console.error('Failed to save progress:', err);
    } finally {
      saving = false;
    }
  }

  async function unmarkComplete(practiceId: number) {
    if (saving || !completedPractices.includes(practiceId)) return;
    saving = true;

    try {
      const updated = completedPractices.filter((id: number) => id !== practiceId);
      const newComfort = comfortLevelFromPractices(updated.length);

      await api.patch(`/users/${auth.user?.userId}`, {
        preferences: {
          ...profile.preferences,
          completedPractices: updated,
          comfortLevel: newComfort,
        },
      });

      const res = await api.get(`/users/${auth.user?.userId}`);
      profile = res.data;
      showCelebration = false;
    } catch (err) {
      console.error('Failed to save progress:', err);
    } finally {
      saving = false;
    }
  }

  const comfortBadgeColor = $derived(
    comfortLevel === 'advanced' ? 'bg-success/10 text-success' :
    comfortLevel === 'intermediate' ? 'bg-warning/10 text-warning' :
    'bg-primary/10 text-primary'
  );
</script>

<div class="mx-auto max-w-3xl">
  <!-- Back link -->
  <div class="mb-6">
    <a href="/" class="text-sm text-text-muted hover:text-primary">← Back to Dashboard</a>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-24">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
    </div>
  {:else}

    <!-- Header & Progress -->
    <div class="mb-8">
      <div class="flex items-start justify-between">
        <div>
          <h1 class="text-3xl font-bold text-text">Prompting Mastery Journey</h1>
          <p class="mt-2 text-text-muted">
            Learn all {TOTAL_PRACTICES} prompting best practices, one at a time.
          </p>
        </div>
        <span class="rounded-full px-3 py-1 text-sm font-semibold {comfortBadgeColor}">
          {comfortLevel}
        </span>
      </div>

      <!-- Progress bar -->
      <div class="mt-6">
        <div class="mb-2 flex items-center justify-between text-sm">
          <span class="font-medium text-text">{completedCount} / {TOTAL_PRACTICES} completed</span>
          <span class="font-semibold text-primary">{progressPercent}%</span>
        </div>
        <div class="h-3 overflow-hidden rounded-full bg-border">
          <div
            class="h-full rounded-full bg-primary transition-all duration-500"
            style="width: {progressPercent}%"
          ></div>
        </div>
      </div>
    </div>

    <!-- Celebration -->
    {#if showCelebration || allDone}
      <div class="mb-8 rounded-xl bg-success/10 p-6 text-center ring-1 ring-success/30">
        <div class="mb-2 text-4xl">🎉</div>
        <h2 class="text-xl font-bold text-success">Journey Complete!</h2>
        <p class="mt-1 text-sm text-text-muted">
          You've mastered all {TOTAL_PRACTICES} prompting practices. Your AI comfort level is now <strong class="text-success">advanced</strong>.
        </p>
      </div>
    {/if}

    <!-- Current Practice Card -->
    {#if nextPractice && !allDone}
      <div class="mb-8 rounded-xl bg-surface shadow-sm ring-1 ring-border overflow-hidden">
        <div class="border-b border-border bg-primary/5 px-6 py-4">
          <div class="flex items-center gap-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
              {nextPractice.id}
            </span>
            <div>
              <div class="text-xs font-semibold uppercase tracking-wider text-primary">
                Practice {nextPractice.id} of {TOTAL_PRACTICES}
              </div>
              <h2 class="text-xl font-bold text-text">{nextPractice.title}</h2>
            </div>
          </div>
        </div>

        <div class="px-6 py-5">
          <p class="mb-5 text-text-muted">{nextPractice.summary}</p>

          <!-- Why it works -->
          <div class="mb-5 rounded-lg bg-primary/5 p-4">
            <h3 class="mb-1 text-sm font-semibold text-primary">💡 Why This Works</h3>
            <p class="text-sm text-text-muted">{nextPractice.why}</p>
          </div>

          <!-- Examples -->
          {#each nextPractice.examples as example, i}
            <div class="mb-4 last:mb-0">
              {#if nextPractice.examples.length > 1}
                <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-text-faint">
                  Example {i + 1}
                </h4>
              {/if}

              <div class="mb-2 rounded-lg border border-danger/20 bg-danger/5 p-4">
                <div class="mb-1 flex items-center gap-2 text-xs font-semibold text-danger">
                  ❌ Don't do this
                </div>
                <p class="text-sm text-text">{example.bad}</p>
              </div>

              <div class="mb-2 rounded-lg border border-success/20 bg-success/5 p-4">
                <div class="mb-1 flex items-center gap-2 text-xs font-semibold text-success">
                  ✅ Do this instead
                </div>
                <p class="whitespace-pre-line text-sm text-text">{example.good}</p>
              </div>

              <div class="rounded-lg bg-surface-dark p-3">
                <p class="text-xs text-text-muted">
                  <span class="font-semibold">Why it's better:</span> {example.whyBetter}
                </p>
              </div>
            </div>
          {/each}

          <!-- Mark as learned button -->
          <div class="mt-6 border-t border-border pt-5">
            <button
              onclick={() => markComplete(nextPractice.id)}
              disabled={saving}
              class="w-full rounded-lg bg-primary px-6 py-3 font-semibold text-white transition-colors
                hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {#if saving}
                <span class="inline-flex items-center gap-2">
                  <span class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                  Saving...
                </span>
              {:else}
                ✅ I've Learned This — Next Practice
              {/if}
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Completed Practices List -->
    {#if completedCount > 0}
      <div class="rounded-xl bg-surface shadow-sm ring-1 ring-border">
        <div class="border-b border-border px-6 py-4">
          <h3 class="font-semibold text-text">Completed Practices</h3>
        </div>
        <div class="divide-y divide-border">
          {#each promptingPractices as practice (practice.id)}
            {#if completedPractices.includes(practice.id)}
              <div class="flex items-center justify-between px-6 py-3">
                <div class="flex items-center gap-3">
                  <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-xs font-bold text-success">
                    ✓
                  </span>
                  <span class="text-sm text-text">
                    <span class="font-medium">{practice.id}.</span> {practice.title}
                  </span>
                </div>
                <button
                  onclick={() => unmarkComplete(practice.id)}
                  disabled={saving}
                  class="text-xs text-text-faint hover:text-danger transition-colors disabled:opacity-50"
                  title="Unmark this practice"
                >
                  undo
                </button>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    <!-- Remaining Practices (preview) -->
    {#if !allDone && completedCount > 0}
      <div class="mt-6 rounded-xl bg-surface shadow-sm ring-1 ring-border">
        <div class="border-b border-border px-6 py-4">
          <h3 class="font-semibold text-text">
            Upcoming ({TOTAL_PRACTICES - completedCount - (nextPractice ? 1 : 0)} remaining)
          </h3>
        </div>
        <div class="divide-y divide-border">
          {#each promptingPractices as practice (practice.id)}
            {#if !completedPractices.includes(practice.id) && practice.id !== nextPractice?.id}
              <div class="flex items-center gap-3 px-6 py-3 opacity-50">
                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-border text-xs font-bold text-text-faint">
                  {practice.id}
                </span>
                <span class="text-sm text-text-muted">{practice.title}</span>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

  {/if}
</div>
