<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';

  const API_BASE = import.meta.env.VITE_API_URL || '/api';

  let stats = $state<Record<string, unknown> | null>(null);
  let loading = $state(true);

  async function loadStats() {
    try {
      const res = await fetch(`${API_BASE}/superadmin/stats`, {
        headers: { Authorization: `Bearer ${auth.user?.token}` },
      });
      if (res.ok) {
        const { data } = await res.json();
        stats = data;
      }
    } catch {
      // ignore
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (auth.user?.token) loadStats();
  });
</script>

<div class="space-y-6">
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <p class="text-text-muted">Loading platform stats...</p>
    </div>
  {:else if stats}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div class="rounded-lg border border-border bg-surface p-6">
        <p class="text-sm text-text-muted">Total Tenants</p>
        <p class="mt-1 text-3xl font-bold text-text">{stats.totalTenants}</p>
      </div>
      <div class="rounded-lg border border-border bg-surface p-6">
        <p class="text-sm text-text-muted">Total Users</p>
        <p class="mt-1 text-3xl font-bold text-text">{stats.totalUsers}</p>
      </div>
      <div class="rounded-lg border border-border bg-surface p-6">
        <p class="text-sm text-text-muted">Plan Breakdown</p>
        <div class="mt-2 space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-text-muted">Free</span>
            <span class="font-medium text-text">{(stats.tenantBreakdown as Record<string, number>)?.free ?? 0}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-text-muted">Pro</span>
            <span class="font-medium text-blue-600">{(stats.tenantBreakdown as Record<string, number>)?.pro ?? 0}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-text-muted">Enterprise</span>
            <span class="font-medium text-purple-600">{(stats.tenantBreakdown as Record<string, number>)?.enterprise ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <p class="text-text-muted">Unable to load stats</p>
  {/if}
</div>
