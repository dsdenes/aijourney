<script lang="ts">
  import { page } from '$app/state';
  import { auth } from '$lib/stores/auth.svelte';
  import { goto } from '$app/navigation';

  let { children } = $props();

  const mainTabs = [
    { label: 'Overview', href: '/settings', icon: '📊' },
    { label: 'Users', href: '/settings/users', icon: '👥' },
    { label: 'Memory', href: '/settings/memory', icon: '🧠' },
    { label: 'Article Recs', href: '/settings/article-recs', icon: '📰' },
  ];

  function isActive(href: string): boolean {
    if (href === '/settings') return page.url.pathname === '/settings';
    return page.url.pathname.startsWith(href);
  }

  const hasSettingsAccess = $derived(auth.user?.orgRole === 'admin' && auth.user?.globalRole !== 'superadmin');

  // Redirect non-admin users
  $effect(() => {
    if (auth.user?.globalRole === 'superadmin') {
      goto('/superadmin', { replaceState: true });
      return;
    }

    if (auth.user && !hasSettingsAccess) {
      goto('/', { replaceState: true });
    }
  });
</script>

{#if hasSettingsAccess}
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-text">Settings</h1>
      <p class="mt-1 text-sm text-text-muted">Tenant admin tools for your active tenant</p>
    </div>

    <!-- Main tab navigation -->
    <div class="mb-6 flex flex-wrap gap-1 rounded-lg bg-surface p-1">
      {#each mainTabs as tab}
        <a
          href={tab.href}
          class="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors
            {isActive(tab.href)
              ? 'bg-primary text-white'
              : 'text-text-muted hover:bg-surface-dark hover:text-text'}"
        >
          <span>{tab.icon}</span>
          {tab.label}
        </a>
      {/each}
    </div>

    {@render children()}
  </div>
{:else}
  <div class="flex items-center justify-center py-20">
    <div class="text-center">
      <p class="text-lg font-medium text-text">Access Denied</p>
      <p class="mt-1 text-sm text-text-muted">Admin privileges required</p>
    </div>
  </div>
{/if}
