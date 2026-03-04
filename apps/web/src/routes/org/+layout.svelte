<script lang="ts">
  import { page } from '$app/state';
  import { auth } from '$lib/stores/auth.svelte';
  import { goto } from '$app/navigation';

  let { children } = $props();

  const tabs = [
    { label: 'Overview', href: '/org', icon: '🏢' },
    { label: 'Members', href: '/org/members', icon: '👥' },
    { label: 'Invitations', href: '/org/invitations', icon: '📩' },
    { label: 'Billing', href: '/org/billing', icon: '💳' },
    { label: 'Usage', href: '/org/usage', icon: '📊' },
  ];

  function isActive(href: string): boolean {
    if (href === '/org') return page.url.pathname === '/org';
    return page.url.pathname.startsWith(href);
  }

  const hasAccess = $derived(
    auth.user?.orgRole === 'owner' || auth.user?.orgRole === 'admin' || auth.user?.globalRole === 'superadmin'
  );

  $effect(() => {
    if (auth.user && !hasAccess) {
      goto('/', { replaceState: true });
    }
  });
</script>

{#if hasAccess}
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-text">Organization</h1>
      <p class="mt-1 text-sm text-text-muted">Manage your organization, members, and billing</p>
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
      <p class="mt-1 text-sm text-text-muted">Organization admin privileges required</p>
    </div>
  </div>
{/if}
