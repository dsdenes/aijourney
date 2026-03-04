<script lang="ts">
  import { page } from '$app/stores';
  import { auth } from '$lib/stores/auth.svelte';

  const navItems = [
    { label: 'Dashboard', href: '/', icon: '🏠' },
    { label: 'AI Chat', href: '/chat', icon: '💬' },
    { label: 'AI Planner', href: '/ai-planner', icon: '🗺️' },
    { label: 'Prompting Practices', href: '/prompting-practices', icon: '📖' },
    { label: 'Optimize My Prompt', href: '/optimize-prompt', icon: '✨' },
    { label: 'Profile', href: '/profile', icon: '👤' },
  ];

  const isAdmin = $derived(auth.user?.role === 'admin');
  const isOrgAdmin = $derived(auth.user?.orgRole === 'owner' || auth.user?.orgRole === 'admin');
  const isSuperadmin = $derived(auth.user?.globalRole === 'superadmin');
</script>

<aside class="flex w-64 flex-col border-r border-border bg-surface">
  <!-- Logo -->
  <div class="flex h-16 items-center px-6">
    <h1 class="text-xl font-bold text-primary">AI Journey</h1>
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

    {#if isAdmin || isSuperadmin}
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
        <p class="truncate text-xs text-text-muted">{auth.user?.email}</p>
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
