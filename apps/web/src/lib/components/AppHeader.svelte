<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { api } from '$lib/api';

  interface TenantOption {
    id: string;
    name: string;
  }

  let tenants = $state<TenantOption[]>([]);
  let loadingTenants = $state(false);

  async function loadTenants() {
    if (auth.user?.globalRole !== 'superadmin') {
      tenants = [];
      return;
    }

    loadingTenants = true;

    try {
      const res = await api.get<Array<{ id: string; name: string }>>('/superadmin/tenants');
      tenants = (res.data || []).map((tenant) => ({ id: tenant.id, name: tenant.name }));

      if (tenants.length > 0 && !tenants.some((tenant) => tenant.id === auth.activeTenantId)) {
        const defaultTenant =
          tenants.find((tenant) => tenant.id === auth.user?.tenantId) || tenants[0];

        if (defaultTenant) {
          auth.setActiveTenant(defaultTenant.id, defaultTenant.name);
        }
      }
    } catch {
      tenants = [];
    } finally {
      loadingTenants = false;
    }
  }

  function handleTenantChange(event: Event) {
    const tenantId = (event.currentTarget as HTMLSelectElement).value;
    const tenant = tenants.find((entry) => entry.id === tenantId);
    auth.setActiveTenant(tenantId, tenant?.name || auth.user?.tenantName || 'Tenant');
    window.location.reload();
  }

  onMount(() => {
    loadTenants();
  });
</script>

<header class="mb-6 flex flex-col gap-4 rounded-2xl border border-border bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <p class="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Workspace</p>
    <div class="mt-1 flex items-center gap-3">
      <h2 class="text-lg font-semibold text-text">{auth.activeTenantName || auth.user?.tenantName || 'Tenant'}</h2>
      {#if auth.user?.globalRole === 'superadmin'}
        <span class="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">Super Admin</span>
      {:else if auth.user?.orgRole === 'admin'}
        <span class="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400">Tenant Admin</span>
      {/if}
    </div>
  </div>

  <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
    {#if auth.user?.globalRole === 'superadmin'}
      <label class="flex flex-col gap-1 text-sm text-text-muted">
        <span class="text-xs font-semibold uppercase tracking-[0.2em]">Active Tenant</span>
        <select
          class="min-w-56 rounded-xl border border-border bg-surface-dark px-3 py-2 text-sm text-text"
          value={auth.activeTenantId}
          onchange={handleTenantChange}
          disabled={loadingTenants}
        >
          {#each tenants as tenant}
            <option value={tenant.id}>{tenant.name}</option>
          {/each}
        </select>
      </label>
    {/if}

    <div class="flex items-center gap-3 rounded-xl bg-surface-dark px-3 py-2">
      <div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
        {auth.user?.name?.[0] || auth.user?.email?.[0] || '?'}
      </div>
      <div>
        <p class="text-sm font-medium text-text">{auth.user?.name}</p>
        <p class="text-xs text-text-muted">{auth.user?.email}</p>
      </div>
      <button
        type="button"
        class="rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:border-primary hover:text-text"
        onclick={() => auth.logout()}
      >
        Sign out
      </button>
    </div>
  </div>
</header>