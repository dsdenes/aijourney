<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';

  const API_BASE = import.meta.env.VITE_API_URL || '/api';

  let tenant = $state<Record<string, unknown> | null>(null);
  let loading = $state(true);
  let error = $state('');

  async function loadTenant() {
    try {
      const res = await fetch(`${API_BASE}/tenants/current`, {
        headers: { Authorization: `Bearer ${auth.user?.token}` },
      });
      if (res.ok) {
        const { data } = await res.json();
        tenant = data;
      } else {
        error = 'Failed to load organization details';
      }
    } catch (e) {
      error = 'Failed to connect to server';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (auth.user?.token) loadTenant();
  });
</script>

{#if loading}
  <div class="flex items-center justify-center py-12">
    <p class="text-text-muted">Loading organization...</p>
  </div>
{:else if error}
  <div class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">{error}</div>
{:else if tenant}
  <div class="space-y-6">
    <div class="rounded-lg border border-border bg-surface p-6">
      <h2 class="text-lg font-semibold text-text">Organization Details</h2>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p class="text-sm text-text-muted">Name</p>
          <p class="text-text font-medium">{tenant.name}</p>
        </div>
        <div>
          <p class="text-sm text-text-muted">Slug</p>
          <p class="font-mono text-sm text-text">{tenant.slug}</p>
        </div>
        <div>
          <p class="text-sm text-text-muted">Plan</p>
          <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
            {tenant.plan === 'enterprise' ? 'bg-purple-100 text-purple-800' :
             tenant.plan === 'pro' ? 'bg-blue-100 text-blue-800' :
             'bg-gray-100 text-gray-800'}">
            {(tenant.plan as string).toUpperCase()}
          </span>
        </div>
        <div>
          <p class="text-sm text-text-muted">Created</p>
          <p class="text-sm text-text">{new Date(tenant.createdAt as string).toLocaleDateString()}</p>
        </div>
      </div>
    </div>

    <div class="rounded-lg border border-border bg-surface p-6">
      <h2 class="text-lg font-semibold text-text">Usage This Period</h2>
      <div class="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <p class="text-sm text-text-muted">LLM Calls Used</p>
          <p class="text-2xl font-bold text-text">{(tenant.usage as Record<string, unknown>)?.llmCallsUsed ?? 0}</p>
        </div>
        <div>
          <p class="text-sm text-text-muted">Plan Limit</p>
          <p class="text-2xl font-bold text-text">
            {(tenant.quotas as Record<string, unknown>)?.maxLlmCallsPerMonth === -1
              ? '∞'
              : (tenant.quotas as Record<string, unknown>)?.maxLlmCallsPerMonth}
          </p>
        </div>
        <div>
          <p class="text-sm text-text-muted">Additional Packs</p>
          <p class="text-2xl font-bold text-text">{(tenant.quotas as Record<string, unknown>)?.additionalLlmCalls ?? 0}</p>
        </div>
      </div>
    </div>
  </div>
{/if}
