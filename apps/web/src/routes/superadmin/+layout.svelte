<script lang="ts">
  import { page } from '$app/state';
  import { auth } from '$lib/stores/auth.svelte';
  import { goto } from '$app/navigation';

  let { children } = $props();

  const tabs = [
    { label: 'Dashboard', href: '/superadmin', icon: '📊' },
    { label: 'Tenants', href: '/superadmin/tenants', icon: '🏢' },
    { label: 'Users', href: '/superadmin/users', icon: '👥' },
    { label: 'Agent Runs', href: '/superadmin/runs', icon: '🤖' },
    { label: 'KB Builder', href: '/superadmin/kb-builder', icon: '🏗️' },
    { label: 'KB Chat', href: '/superadmin/kb-chat', icon: '💬' },
    { label: 'Summarization', href: '/superadmin/summarization', icon: '📝' },
    { label: 'Vector DB', href: '/superadmin/vectordb', icon: '🧮' },
  ];

  function isActive(href: string): boolean {
    if (href === '/superadmin') return page.url.pathname === '/superadmin';
    return page.url.pathname.startsWith(href);
  }

  $effect(() => {
    if (auth.user && auth.user.globalRole !== 'superadmin') {
      goto('/', { replaceState: true });
    }
  });
</script>

{#if auth.user?.globalRole === 'superadmin'}
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-text">Super Admin</h1>
      <p class="mt-1 text-sm text-text-muted">Platform-wide management and analytics</p>
    </div>

    <div class="mb-6 flex flex-wrap gap-1 rounded-lg bg-surface p-1">
      {#each tabs as tab}
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
      <p class="mt-1 text-sm text-text-muted">Super-admin privileges required</p>
    </div>
  </div>
{/if}
