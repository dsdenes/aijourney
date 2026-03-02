<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import { api } from '$lib/api';

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
  const comfortLevel = $derived(profile?.preferences?.comfortLevel || '—');
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
        {journeys.filter(j => j.status === 'active').length}
      </div>
    </div>
    <div class="rounded-xl bg-surface p-6 shadow-sm ring-1 ring-border">
      <div class="text-sm font-semibold text-text">Completed Journeys</div>
      <div class="mt-2 text-3xl font-bold text-success">{completedJourneys}</div>
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
    {:else if journeys.length === 0}
      <div class="py-12 text-center">
        <p class="text-text-muted">No journeys yet. Your personalized AI journey will appear here.</p>
      </div>
    {:else}
      <div class="space-y-3">
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
