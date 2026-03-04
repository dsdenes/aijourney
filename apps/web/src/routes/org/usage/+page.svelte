<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';

  const API_BASE = import.meta.env.VITE_API_URL || '/api';

  let quota = $state<Record<string, unknown> | null>(null);
  let loading = $state(true);

  async function loadUsage() {
    try {
      const res = await fetch(`${API_BASE}/quotas/status`, {
        headers: { Authorization: `Bearer ${auth.user?.token}` },
      });
      if (res.ok) {
        const { data } = await res.json();
        quota = data;
      }
    } catch {
      // ignore
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (auth.user?.token) loadUsage();
  });
</script>

<div class="space-y-6">
  <div class="rounded-lg border border-border bg-surface p-6">
    <h2 class="text-lg font-semibold text-text">Usage Statistics</h2>

    {#if loading}
      <p class="mt-4 text-sm text-text-muted">Loading...</p>
    {:else if quota}
      <div class="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-lg border border-border p-4">
          <p class="text-sm text-text-muted">LLM Calls Used</p>
          <p class="mt-1 text-3xl font-bold text-text">{quota.used}</p>
        </div>
        <div class="rounded-lg border border-border p-4">
          <p class="text-sm text-text-muted">Remaining</p>
          <p class="mt-1 text-3xl font-bold text-text">
            {quota.remainingCalls === Number.MAX_SAFE_INTEGER ? '∞' : quota.remainingCalls}
          </p>
        </div>
        <div class="rounded-lg border border-border p-4">
          <p class="text-sm text-text-muted">Total Limit</p>
          <p class="mt-1 text-3xl font-bold text-text">
            {quota.totalLimit === -1 ? '∞' : quota.totalLimit}
          </p>
        </div>
        <div class="rounded-lg border border-border p-4">
          <p class="text-sm text-text-muted">Status</p>
          <p class="mt-1 text-lg font-semibold {quota.allowed ? 'text-green-600' : 'text-red-600'}">
            {quota.allowed ? 'Active' : 'Quota Exceeded'}
          </p>
        </div>
      </div>
    {:else}
      <p class="mt-4 text-sm text-text-muted">Unable to load usage data</p>
    {/if}
  </div>
</div>
