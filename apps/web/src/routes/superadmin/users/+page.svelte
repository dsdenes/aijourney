<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth.svelte';

  interface SuperAdminUser {
    id: string;
    email: string;
    name: string;
    tenantName: string;
    orgRole: string;
    globalRole: string;
    onboardingComplete: boolean;
    lastLoginAt?: string;
  }

  const PROTECTED_SUPERADMIN_EMAIL = 'dsdenes@gmail.com';

  let users = $state<SuperAdminUser[]>([]);
  let loading = $state(true);
  let error = $state('');
  let actionUserId = $state<string | null>(null);

  async function loadUsers() {
    loading = true;
    error = '';
    try {
      const res = await api.get<SuperAdminUser[]>('/superadmin/users');
      users = res.data || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load users';
    } finally {
      loading = false;
    }
  }

  async function toggleSuperuser(user: SuperAdminUser) {
    const action = user.globalRole === 'superadmin' ? 'demote' : 'promote';
    actionUserId = user.id;
    error = '';

    try {
      await api.post(`/superadmin/users/${user.id}/${action}`);
      await loadUsers();
    } catch (err) {
      error = err instanceof Error ? err.message : `Failed to ${action} superuser`;
    } finally {
      actionUserId = null;
    }
  }

  function formatDate(iso?: string) {
    return iso ? new Date(iso).toLocaleString() : 'Never';
  }

  onMount(loadUsers);
</script>

<div class="space-y-5">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-lg font-semibold text-text">All Users</h2>
      <p class="mt-1 text-sm text-text-muted">Cross-tenant user directory and superuser controls.</p>
    </div>
    <span class="text-sm text-text-muted">{users.length} total</span>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
    </div>
  {:else if error}
    <div class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">{error}</div>
  {:else}
    <div class="overflow-x-auto rounded-lg border border-border bg-surface">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-border text-text">
            <th class="px-4 py-3 font-medium">User</th>
            <th class="px-4 py-3 font-medium">Tenant</th>
            <th class="px-4 py-3 font-medium">Tenant Role</th>
            <th class="px-4 py-3 font-medium">Global Role</th>
            <th class="px-4 py-3 font-medium">Onboarded</th>
            <th class="px-4 py-3 font-medium">Last Login</th>
            <th class="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each users as user}
            <tr class="border-b border-border/50 transition-colors hover:bg-surface-dark/50">
              <td class="px-4 py-3">
                <div class="font-medium text-text">{user.name}</div>
                <div class="text-xs text-text-muted">{user.email}</div>
              </td>
              <td class="px-4 py-3 text-text-muted">{user.tenantName || '—'}</td>
              <td class="px-4 py-3">
                <span class="rounded-full px-2.5 py-0.5 text-xs font-medium {user.orgRole === 'admin' || user.orgRole === 'owner' ? 'bg-primary/20 text-primary' : 'bg-surface-dark text-text-muted'}">
                  {user.orgRole}
                </span>
              </td>
              <td class="px-4 py-3">
                <span class="rounded-full px-2.5 py-0.5 text-xs font-medium {user.globalRole === 'superadmin' ? 'bg-primary/15 text-primary' : 'bg-surface-dark text-text-muted'}">
                  {user.globalRole}
                </span>
              </td>
              <td class="px-4 py-3 text-text-muted">{user.onboardingComplete ? 'Yes' : 'No'}</td>
              <td class="px-4 py-3 text-text-muted">{formatDate(user.lastLoginAt)}</td>
              <td class="px-4 py-3">
                {#if user.email.toLowerCase() === PROTECTED_SUPERADMIN_EMAIL}
                  <span class="text-xs italic text-text-muted">Protected</span>
                {:else}
                  <button
                    type="button"
                    class="rounded px-2.5 py-1 text-xs font-medium transition-colors {user.globalRole === 'superadmin' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-primary/20 text-primary hover:bg-primary/30'} disabled:opacity-50"
                    disabled={actionUserId === user.id || (user.email === auth.user?.email && user.globalRole === 'superadmin')}
                    onclick={() => toggleSuperuser(user)}
                  >
                    {#if actionUserId === user.id}
                      …
                    {:else if user.globalRole === 'superadmin'}
                      Revoke Superuser
                    {:else}
                      Make Superuser
                    {/if}
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>