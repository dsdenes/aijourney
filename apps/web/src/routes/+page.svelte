<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import { api } from '$lib/api';
  import { comfortLevelFromPractices, TOTAL_PRACTICES } from '@aijourney/shared';

  let journeys = $state<any[]>([]);
  let profile = $state<any>(null);
  let loading = $state(true);

  $effect(() => {
    if (auth.user) {
      loadData();
    }
  });

  async function loadData() {
    try {
      const [journeysRes, profileRes] = await Promise.all([
        api.get('/journeys'),
        api.get(`/users/${auth.user?.userId}`),
      ]);
      journeys = journeysRes.data || [];
      profile = profileRes.data;
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      loading = false;
    }
  }

  const completedJourneys = $derived(journeys.filter(j => j.status === 'completed').length);

  // Prompting practices progress
  const completedPractices = $derived<number[]>(profile?.preferences?.completedPractices ?? []);
  const practiceCount = $derived(completedPractices.length);
  const allPracticesDone = $derived(practiceCount >= TOTAL_PRACTICES);
  const practiceProgressPercent = $derived(Math.round((practiceCount / TOTAL_PRACTICES) * 100));

  // Comfort level is driven by practice completion
  const comfortLevel = $derived(
    practiceCount > 0 ? comfortLevelFromPractices(practiceCount) : (profile?.preferences?.comfortLevel || '—')
  );

  // Count the prompting mastery as a completed journey if all done
  const totalCompletedJourneys = $derived(completedJourneys + (allPracticesDone ? 1 : 0));
</script>

<div>
  <div class="mb-8 flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-bold text-text">Dashboard</h1>
      <p class="mt-1 text-text-muted">
        Welcome back, {auth.user?.name || 'User'}
      </p>
    </div>
  </div>

  <!-- Stats Cards -->
  <div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
    <div class="rounded-xl bg-surface p-6 shadow-sm ring-1 ring-border">
      <div class="text-sm font-semibold text-text">Active Journeys</div>
      <div class="mt-2 text-3xl font-bold text-primary">
        {journeys.filter(j => j.status === 'active').length + (allPracticesDone ? 0 : 1)}
      </div>
    </div>
    <div class="rounded-xl bg-surface p-6 shadow-sm ring-1 ring-border">
      <div class="text-sm font-semibold text-text">Completed Journeys</div>
      <div class="mt-2 text-3xl font-bold text-success">{totalCompletedJourneys}</div>
    </div>
    <div class="rounded-xl bg-surface p-6 shadow-sm ring-1 ring-border">
      <div class="text-sm font-semibold text-text">AI Comfort Level</div>
      <div class="mt-2 text-3xl font-bold text-secondary">{comfortLevel}</div>
    </div>
  </div>

  <!-- Journeys List -->
  <div class="rounded-xl bg-surface p-6 shadow-sm ring-1 ring-border">
    <h2 class="mb-4 text-xl font-semibold text-text">Your Journeys</h2>

    {#if loading}
      <div class="flex items-center justify-center py-12">
        <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    {:else}
      <div class="space-y-3">
        <!-- Prompting Mastery Journey (always shown) -->
        <a
          href="/journeys/prompting-mastery"
          class="block rounded-lg p-4 transition-colors hover:bg-surface-dark ring-1 ring-border"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <h3 class="font-medium text-text">📖 Prompting Mastery</h3>
                {#if allPracticesDone}
                  <span class="text-success text-sm">✓</span>
                {/if}
              </div>
              <p class="mt-1 text-sm text-text-muted">
                {#if allPracticesDone}
                  All {TOTAL_PRACTICES} practices completed — AI comfort level: advanced
                {:else}
                  Practice {practiceCount + 1} of {TOTAL_PRACTICES} · {practiceCount} completed
                {/if}
              </p>
              <!-- Mini progress bar -->
              {#if !allPracticesDone}
                <div class="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-border">
                  <div
                    class="h-full rounded-full bg-primary transition-all duration-500"
                    style="width: {practiceProgressPercent}%"
                  ></div>
                </div>
              {/if}
            </div>
            <span class="rounded-full px-3 py-1 text-sm font-medium
              {allPracticesDone ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}">
              {allPracticesDone ? 'completed' : 'active'}
            </span>
          </div>
        </a>

        <!-- Other journeys -->
        {#each journeys as journey}
          <a
            href="/journeys/{journey.id}"
            class="block rounded-lg p-4 transition-colors hover:bg-surface-dark ring-1 ring-border"
          >
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-medium text-text">{journey.title || 'Untitled Journey'}</h3>
                <p class="mt-1 text-sm text-text-muted">
                  Level: {journey.level || 'TBD'} · Created {new Date(journey.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span class="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                {journey.status}
              </span>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</div>
