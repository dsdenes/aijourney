<script lang="ts">
  import { page } from '$app/stores';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth.svelte';

  const baseNavItems = [
    { label: 'Dashboard', href: '/', icon: '🏠' },
    { label: 'AI Planner', href: '/ai-planner', icon: '🗺️' },
    { label: 'Prompting Practices', href: '/prompting-practices', icon: '📖' },
    { label: 'Optimize My Prompt', href: '/optimize-prompt', icon: '✨' },
    { label: 'Profile', href: '/profile', icon: '👤' },
  ];

  const isOrgAdmin = $derived(auth.user?.orgRole === 'owner' || auth.user?.orgRole === 'admin');
  const isSuperadmin = $derived(auth.user?.globalRole === 'superadmin');
  const navItems = $derived(
    isSuperadmin
      ? [...baseNavItems.slice(0, 1), { label: 'AI Chat', href: '/chat', icon: '💬' }, ...baseNavItems.slice(1)]
      : baseNavItems,
  );

  // Tenant switcher for superadmins
  interface TenantOption { id: string; name: string; slug: string }
  interface TenantMembershipOption { tenantId: string; tenantName: string; slug: string; orgRole: string }
  let tenantList = $state<TenantOption[]>([]);
  let tenantMemberships = $state<TenantMembershipOption[]>([]);
  let tenantDropdownOpen = $state(false);
  let tenantInfoLoading = $state(false);

  async function loadTenants() {
    if (!isSuperadmin || !auth.user?.token) return;
    try {
      const res = await api.get<Array<Record<string, unknown>>>('/superadmin/tenants');
      tenantList = (res.data || []).map((t: Record<string, unknown>) => ({
        id: t.id as string,
        name: t.name as string,
        slug: t.slug as string,
      }));
    } catch { /* ignore */ }
  }

  async function loadTenantMemberships() {
    if (isSuperadmin || !auth.user?.token) return;
    try {
      const res = await api.get<TenantMembershipOption[]>('/tenants/memberships');
      tenantMemberships = res.data || [];
      const currentMembership = tenantMemberships.find(
        (membership) => membership.tenantId === auth.user?.tenantId,
      );
      if (currentMembership && auth.user) {
        const needsSync =
          currentMembership.tenantName !== auth.user.tenantName ||
          currentMembership.orgRole !== auth.user.orgRole;
        if (needsSync) {
          auth.setUser({
            ...auth.user,
            tenantName: currentMembership.tenantName,
            orgRole: currentMembership.orgRole,
          });
        }
      }
    } catch {
      tenantMemberships = [];
    }
  }

  async function syncCurrentTenant() {
    if (!auth.user?.token || tenantInfoLoading) return;

    tenantInfoLoading = true;
    try {
      const res = await api.get<Record<string, unknown>>('/tenants/current');
      const tenant = res.data;
      if (tenant?.id && auth.user) {
        const tenantId = tenant.id as string;
        const tenantName = (tenant.name as string) || auth.user.tenantName;
        if (tenantId !== auth.user.tenantId || tenantName !== auth.user.tenantName) {
          auth.setUser({
            ...auth.user,
            tenantId,
            tenantName,
          });
        }
      }
    } catch {
      // Keep existing client-side tenant info if the sync request fails.
    } finally {
      tenantInfoLoading = false;
    }
  }

  $effect(() => {
    if (auth.user?.token) {
      syncCurrentTenant();
    }
    if (isSuperadmin && auth.user?.token) {
      loadTenants();
    } else if (auth.user?.token) {
      loadTenantMemberships();
    }
  });

  async function switchTenant(tenantId: string) {
    tenantDropdownOpen = false;
    if (!auth.user?.token) return;
    try {
      const res = isSuperadmin
        ? await api.post<{ tenantId: string; tenantName: string; orgRole?: string }>('/superadmin/switch-tenant', {
            tenantId,
          })
        : await api.post<{ tenantId: string; tenantName: string; orgRole: string }>('/tenants/switch', {
            tenantId,
          });
      if (res.data && auth.user) {
        const data = res.data;
        auth.setUser({
          ...auth.user,
          tenantId: data.tenantId,
          tenantName: data.tenantName,
          orgRole: data.orgRole || auth.user.orgRole,
        });
      }
    } catch { /* ignore */ }
  }

  const canSwitchTenant = $derived(
    isSuperadmin ? tenantList.length > 0 : tenantMemberships.length > 1,
  );
</script>

<aside class="flex w-64 flex-col border-r border-border bg-surface">
  <!-- Logo -->
  <div class="border-b border-border px-6 py-5">
    <h1 class="text-xl font-bold text-primary">AI Journey</h1>
    {#if canSwitchTenant}
      <div class="relative mt-3">
        <button
          onclick={() => tenantDropdownOpen = !tenantDropdownOpen}
          class="flex w-full items-center justify-between gap-2 rounded-md bg-primary/5 px-3 py-2 text-left transition-colors hover:bg-primary/10"
        >
          <div class="overflow-hidden">
            <p class="truncate text-xs font-medium uppercase tracking-wide text-text-muted">Tenant</p>
            <p class="truncate text-sm font-semibold text-primary">{auth.user?.tenantName || 'No tenant'}</p>
          </div>
          <span class="text-xs text-text-muted">{tenantDropdownOpen ? '▲' : '▼'}</span>
        </button>
        {#if tenantDropdownOpen}
          <div class="absolute left-0 top-full z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
            {#if isSuperadmin}
              {#each tenantList as tenant}
                <button
                  onclick={() => switchTenant(tenant.id)}
                  class="block w-full px-3 py-2 text-left text-xs transition-colors hover:bg-surface-dark
                    {auth.user?.tenantId === tenant.id ? 'font-bold text-primary' : 'text-text'}"
                >
                  {tenant.name}
                </button>
              {/each}
            {:else}
              {#each tenantMemberships as membership}
                <button
                  onclick={() => switchTenant(membership.tenantId)}
                  class="block w-full px-3 py-2 text-left text-xs transition-colors hover:bg-surface-dark
                    {auth.user?.tenantId === membership.tenantId ? 'font-bold text-primary' : 'text-text'}"
                >
                  <div>{membership.tenantName}</div>
                  <div class="text-[11px] text-text-muted">{membership.orgRole}</div>
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <div class="mt-3 rounded-md bg-primary/5 px-3 py-2">
        <p class="truncate text-xs font-medium uppercase tracking-wide text-text-muted">Tenant</p>
        <p class="truncate text-sm font-semibold text-primary">{auth.user?.tenantName || 'No tenant'}</p>
      </div>
    {/if}
    <div class="mt-3">
      <p class="truncate text-xs font-medium uppercase tracking-wide text-text-muted">Signed in as</p>
      <p class="truncate text-sm text-text">{auth.user?.email}</p>
    </div>
  </div>

  <!-- Navigation -->
  <nav class="flex-1 space-y-1 px-3 py-4">
    {#each navItems as item}
      <a
        href={item.href}
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
          {($page.url.pathname === item.href || (item.href !== '/' && $page.url.pathname.startsWith(item.href)))
            ? 'bg-primary/10 text-primary'
            : 'text-text-muted hover:bg-surface-dark hover:text-text'}"
      >
        <span>{item.icon}</span>
        {item.label}
      </a>
    {/each}

    {#if isOrgAdmin}
      <div class="my-3 border-t border-border"></div>
      <p class="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-text-muted">Organization</p>
      <a
        href="/org"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
          {$page.url.pathname.startsWith('/org')
            ? 'bg-primary/10 text-primary'
            : 'text-text-muted hover:bg-surface-dark hover:text-text'}"
      >
        <span>🏢</span>
        Org Settings
      </a>
      <a
        href="/org/members"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
          {$page.url.pathname.startsWith('/org/members')
            ? 'bg-primary/10 text-primary'
            : 'text-text-muted hover:bg-surface-dark hover:text-text'}"
      >
        <span>👥</span>
        Members
      </a>
      <a
        href="/org/company-context"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
          {$page.url.pathname.startsWith('/org/company-context')
            ? 'bg-primary/10 text-primary'
            : 'text-text-muted hover:bg-surface-dark hover:text-text'}"
      >
        <span>📋</span>
        Company Context
      </a>
      <a
        href="/org/billing"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
          {$page.url.pathname.startsWith('/org/billing')
            ? 'bg-primary/10 text-primary'
            : 'text-text-muted hover:bg-surface-dark hover:text-text'}"
      >
        <span>💳</span>
        Billing
      </a>
    {/if}

    {#if !isSuperadmin && isOrgAdmin}
      <div class="my-3 border-t border-border"></div>
      <p class="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-text-muted">Admin</p>
      <a
        href="/settings"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
          {$page.url.pathname.startsWith('/settings')
            ? 'bg-primary/10 text-primary'
            : 'text-text-muted hover:bg-surface-dark hover:text-text'}"
      >
        <span>⚙️</span>
        Settings
      </a>
    {/if}

    {#if isSuperadmin}
      <div class="my-3 border-t border-border"></div>
      <p class="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-text-muted">Platform</p>
      <a
        href="/superadmin"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
          {$page.url.pathname.startsWith('/superadmin')
            ? 'bg-primary/10 text-primary'
            : 'text-text-muted hover:bg-surface-dark hover:text-text'}"
      >
        <span>🛡️</span>
        Super Admin
      </a>
    {/if}
  </nav>

  <!-- User info + logout -->
  <div class="border-t border-border p-4">
    <div class="flex items-center gap-3">
      <div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
        {auth.user?.name?.[0] || '?'}
      </div>
      <div class="flex-1 overflow-hidden">
        <p class="truncate text-sm font-medium text-text">{auth.user?.name}</p>
        <p class="truncate text-xs text-text-muted">{auth.user?.globalRole === 'superadmin' ? 'Super Admin' : auth.user?.orgRole}</p>
      </div>
    </div>
    <button
      onclick={() => auth.logout()}
      class="mt-3 w-full rounded-lg bg-surface-dark px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-darker hover:text-text"
    >
      Sign out
    </button>
  </div>
</aside>
