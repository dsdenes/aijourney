<script lang="ts">
  import { api } from '$lib/api';

  interface TenantRow {
    id: string;
    name: string;
    slug: string;
    plan: string;
    userCount: number;
    llmCallsUsed: number;
    llmCallsLimit: number;
    createdAt: string;
  }

  let tenants = $state<TenantRow[]>([]);
  let loading = $state(true);
  let error = $state('');
  let successMessage = $state('');
  let creating = $state(false);
  let tenantName = $state('');
  let tenantSlug = $state('');
  let ownerEmail = $state('');
  let tenantPlan = $state('free');
  let slugEdited = $state(false);

  async function loadTenants() {
    loading = true;
    error = '';
    try {
      const res = await api.get<TenantRow[]>('/superadmin/tenants');
      tenants = res.data || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load tenants';
    } finally {
      loading = false;
    }
  }

  function slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
  }

  function onTenantNameInput(value: string) {
    tenantName = value;
    if (!slugEdited) {
      tenantSlug = slugify(value);
    }
  }

  $effect(() => {
    loadTenants();
  });

  async function changePlan(tenantId: string, plan: string) {
    try {
      await api.put(`/superadmin/tenants/${tenantId}/plan`, { plan });
      successMessage = 'Tenant plan updated';
      await loadTenants();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update plan';
    }
  }

  async function createTenant() {
    creating = true;
    error = '';
    successMessage = '';

    try {
      const result = await api.post<{
        tenant: { name: string };
        ownerEmail?: string;
        ownerAction?: 'assigned' | 'invited';
        ownerInvitation?: { email: string };
      }>(
        '/superadmin/tenants',
        {
          name: tenantName,
          slug: tenantSlug,
          ownerEmail,
          plan: tenantPlan,
        },
      );

      const resolvedOwnerEmail = result.data?.ownerEmail || result.data?.ownerInvitation?.email || ownerEmail;
      const ownerAction = result.data?.ownerAction === 'assigned' ? 'assigned existing owner' : 'invited owner';
      successMessage = `Created ${result.data?.tenant.name || 'tenant'} and ${ownerAction} ${resolvedOwnerEmail}`;
      tenantName = '';
      tenantSlug = '';
      ownerEmail = '';
      tenantPlan = 'free';
      slugEdited = false;
      await loadTenants();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create tenant';
    } finally {
      creating = false;
    }
  }
</script>

<div class="space-y-6">
  <div class="rounded-lg border border-border bg-surface p-6">
    <h2 class="text-lg font-semibold text-text">Create Tenant</h2>
    <p class="mt-1 text-sm text-text-muted">Create a tenant and either assign an existing owner or invite a not-yet-registered owner email.</p>

    {#if successMessage}
      <div class="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{successMessage}</div>
    {/if}

    {#if error}
      <div class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
    {/if}

    <form
      class="mt-4 grid gap-4 md:grid-cols-2"
      onsubmit={(event) => {
        event.preventDefault();
        createTenant();
      }}
    >
      <label class="block text-sm text-text">
        <span class="mb-1 block text-text-muted">Tenant name</span>
        <input
          value={tenantName}
          oninput={(event) => onTenantNameInput((event.currentTarget as HTMLInputElement).value)}
          class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
          placeholder="Example Organization"
          required
        />
      </label>

      <label class="block text-sm text-text">
        <span class="mb-1 block text-text-muted">Owner email</span>
        <input
          bind:value={ownerEmail}
          type="email"
          class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
          placeholder="owner@example.com"
          required
        />
      </label>

      <label class="block text-sm text-text">
        <span class="mb-1 block text-text-muted">Slug</span>
        <input
          value={tenantSlug}
          oninput={(event) => {
            slugEdited = true;
            tenantSlug = slugify((event.currentTarget as HTMLInputElement).value);
          }}
          class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
          placeholder="example-organization"
          required
        />
      </label>

      <label class="block text-sm text-text">
        <span class="mb-1 block text-text-muted">Plan</span>
        <select
          bind:value={tenantPlan}
          class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
        >
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </label>

      <div class="md:col-span-2">
        <button
          type="submit"
          disabled={creating || !tenantName.trim() || !tenantSlug.trim() || !ownerEmail.trim()}
          class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create Tenant'}
        </button>
      </div>
    </form>
  </div>

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
                {new Date(tenant.createdAt).toLocaleDateString()}
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <select
                  class="rounded border border-border bg-surface px-2 py-1 text-sm text-text"
                  value={tenant.plan}
                  onchange={(e) => changePlan(tenant.id, (e.target as HTMLSelectElement).value)}
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
