<script lang="ts">
  import { page } from '$app/state';
  import { auth } from '$lib/stores/auth.svelte';
  import { goto } from '$app/navigation';

  let { children } = $props();

  const mainTabs = [
    { label: 'Overview', href: '/settings', icon: '📊' },
    { label: 'Agent Runs', href: '/settings/runs', icon: '🤖' },
    { label: 'Users', href: '/settings/users', icon: '👥' },
    { label: 'Vector DB', href: '/settings/vectordb', icon: '🧮' },
    { label: 'Workers', href: '/settings/workers', icon: '⚙️' },
  ];

  const workerTabs = [
    { label: 'Summarization', href: '/settings/workers/summarization', icon: '📝' },
    { label: 'Personalization', href: '/settings/workers/personalization', icon: '🎯' },
    { label: 'KB Chat', href: '/settings/workers/kb-chat', icon: '💬' },
    { label: 'KB Builder', href: '/settings/workers/kb-builder', icon: '🏗️' },
  ];

  function isActive(href: string): boolean {
    if (href === '/settings') return page.url.pathname === '/settings';
    if (href === '/settings/workers') return page.url.pathname.startsWith('/settings/workers');
    return page.url.pathname.startsWith(href);
  }

  const isWorkersSection = $derived(page.url.pathname.startsWith('/settings/workers'));

  // Redirect non-admin users
  $effect(() => {
    if (auth.user && auth.user.role !== 'admin') {
      goto('/', { replaceState: true });
    }
  });
</script>

{#if auth.user?.role === 'admin'}
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-text">Settings</h1>
      <p class="mt-1 text-sm text-text-muted">Admin panel — monitors, metrics, and user management</p>
    </div>

    <!-- Main tab navigation -->
    <div class="mb-2 flex gap-1 rounded-lg bg-surface p-1">
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

    <!-- Worker sub-tabs (only when on a workers route) -->
    {#if isWorkersSection}
      <div class="mb-6 flex gap-1 rounded-lg bg-surface/50 p-1">
        {#each workerTabs as tab}
          <a
            href={tab.href}
            class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors
              {isActive(tab.href)
                ? 'bg-accent text-white'
                : 'text-text-muted hover:bg-surface-dark hover:text-text'}"
          >
            <span>{tab.icon}</span>
            {tab.label}
          </a>
        {/each}
      </div>
    {:else}
      <div class="mb-6"></div>
    {/if}

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
