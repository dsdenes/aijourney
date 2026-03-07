<script lang="ts">
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth.svelte';
  import { onMount } from 'svelte';

  interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    department?: string;
    jobTitle?: string;
    onboardingComplete: boolean;
    lastLoginAt: string;
    createdAt: string;
    updatedAt: string;
  }

  let users = $state<User[]>([]);
  let loading = $state(true);
  let error = $state('');
  let actionLoading = $state<string | null>(null);

  async function loadUsers() {
    try {
      const res = await api.get<User[]>('/users');
      users = res.data || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load users';
    } finally {
      loading = false;
    }
  }

  onMount(loadUsers);

  async function toggleRole(user: User) {
    const action = user.role === 'admin' ? 'revoke' : 'promote';
    actionLoading = user.id;
    try {
      await api.post(`/users/${user.id}/${action}`);
      await loadUsers();
    } catch (err) {
      error = err instanceof Error ? err.message : `Failed to ${action} user`;
    } finally {
      actionLoading = null;
    }
  }

  function formatDate(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }
</script>

<div>
  <div class="mb-4 flex items-center justify-between">
    <h2 class="text-lg font-semibold text-text">All Users</h2>
    <span class="text-sm text-text-muted">{users.length} user{users.length !== 1 ? 's' : ''}</span>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
    </div>
  {:else if error}
    <div class="rounded-lg bg-red-900/30 p-4 text-red-200">{error}</div>
  {:else if users.length === 0}
    <div class="rounded-lg bg-surface p-8 text-center">
      <p class="text-text-muted">No users have logged in yet</p>
    </div>
  {:else}
    <div class="overflow-x-auto rounded-lg bg-surface">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-border text-text">
            <th class="px-4 py-3 font-medium">Name</th>
            <th class="px-4 py-3 font-medium">Email</th>
            <th class="px-4 py-3 font-medium">Role</th>
            <th class="px-4 py-3 font-medium">Department</th>
            <th class="px-4 py-3 font-medium">Onboarded</th>
            <th class="px-4 py-3 font-medium">Created</th>
            <th class="px-4 py-3 font-medium">Last Login</th>
            <th class="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each users as user}
            <tr class="border-b border-border/50 transition-colors hover:bg-surface-dark/50">
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <div class="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {user.name?.[0] || '?'}
                  </div>
                  <span class="font-medium text-text">{user.name || '—'}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-text-muted">{user.email}</td>
              <td class="px-4 py-3">
                <span class="rounded-full px-2.5 py-0.5 text-xs font-medium
                  {user.role === 'admin' ? 'bg-primary/20 text-primary' : 'bg-surface-dark text-text-muted'}">
                  {user.role}
                </span>
              </td>
              <td class="px-4 py-3 text-text-muted">{user.department || '—'}</td>
              <td class="px-4 py-3">
                {#if user.onboardingComplete}
                  <span class="text-green-600">✓</span>
                {:else}
                  <span class="text-text-muted">—</span>
                {/if}
              </td>
              <td class="px-4 py-3 text-text-muted text-xs">{formatDate(user.createdAt)}</td>
              <td class="px-4 py-3 text-text-muted text-xs">{formatDate(user.lastLoginAt)}</td>
              <td class="px-4 py-3">
                {#if user.email !== auth.user?.email}
                  <button
                    onclick={() => toggleRole(user)}
                    disabled={actionLoading === user.id}
                    class="rounded px-2.5 py-1 text-xs font-medium transition-colors
                      {user.role === 'admin'
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-primary/20 text-primary hover:bg-primary/30'}
                      disabled:opacity-50"
                  >
                    {#if actionLoading === user.id}
                      …
                    {:else if user.role === 'admin'}
                      Revoke Admin
                    {:else}
                      Make Admin
                    {/if}
                  </button>
                {:else}
                  <span class="text-xs text-text-muted italic">You</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
