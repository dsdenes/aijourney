<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';

  const API_BASE = import.meta.env.VITE_API_URL || '/api';

  let tenants = $state<Array<Record<string, unknown>>>([]);
  let loading = $state(true);
  let error = $state('');

  async function loadTenants() {
    try {
      const res = await fetch(`${API_BASE}/superadmin/tenants`, {
        headers: { Authorization: `Bearer ${auth.user?.token}` },
      });
      if (res.ok) {
        const { data } = await res.json();
        tenants = data || [];
      } else {
        error = 'Failed to load tenants';
      }
    } catch {
      error = 'Failed to connect to server';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (auth.user?.token) loadTenants();
  });

  async function changePlan(tenantId: string, plan: string) {
    try {
      await fetch(`${API_BASE}/superadmin/tenants/${tenantId}/plan`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${auth.user?.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan }),
      });
      await loadTenants();
    } catch {
      error = 'Failed to update plan';
    }
  }
</script>

<div class="space-y-6">
  <h2 class="text-lg font-semibold text-text">All Tenants</h2>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <p class="text-text-muted">Loading tenants...</p>
    </div>
  {:else if error}
    <div class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">{error}</div>
  {:else}
    <div class="overflow-hidden rounded-lg border border-border">
      <table class="min-w-full divide-y divide-border">
        <thead class="bg-surface">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Name</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Slug</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Plan</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Users</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">LLM Usage</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Created</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border bg-surface">
          {#each tenants as tenant}
            <tr>
              <td class="whitespace-nowrap px-6 py-4 text-sm font-medium text-text">
                <a href="/superadmin/tenants/{tenant.id}" class="text-primary hover:text-primary-dark">
                  {tenant.name}
                </a>
              </td>
              <td class="whitespace-nowrap px-6 py-4 font-mono text-sm text-text-muted">{tenant.slug}</td>
              <td class="whitespace-nowrap px-6 py-4">
                <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                  {tenant.plan === 'enterprise' ? 'bg-purple-100 text-purple-800' :
                   tenant.plan === 'pro' ? 'bg-blue-100 text-blue-800' :
                   'bg-gray-100 text-gray-800'}">
                  {tenant.plan}
                </span>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-text">{tenant.userCount}</td>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-text">
                {tenant.llmCallsUsed}
                / {tenant.llmCallsLimit === -1 ? '∞' : tenant.llmCallsLimit}
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-text-muted">
                {new Date(tenant.createdAt as string).toLocaleDateString()}
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <select
                  class="rounded border border-border bg-surface px-2 py-1 text-sm text-text"
                  value={tenant.plan}
                  onchange={(e) => changePlan(tenant.id as string, (e.target as HTMLSelectElement).value)}
                >
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
