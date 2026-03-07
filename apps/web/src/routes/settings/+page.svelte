<script lang="ts">
  import { api } from '$lib/api';
  import { onMount } from 'svelte';

  interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    lastLoginAt: string;
    createdAt: string;
  }

  let users = $state<User[]>([]);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    try {
      const usersRes = await api.get<User[]>('/users');
      users = usersRes.data || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load data';
    } finally {
      loading = false;
    }
  });

  // Derived metrics
  const totalUsers = $derived(users.length);
  const adminCount = $derived(users.filter(u => u.role === 'admin').length);
  const recentLogins = $derived(
    [...users]
      .filter(u => u.lastLoginAt)
      .sort((a, b) => b.lastLoginAt.localeCompare(a.lastLoginAt))
      .slice(0, 5)
  );
</script>

{#if loading}
  <div class="flex items-center justify-center py-12">
    <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
  </div>
{:else if error}
  <div class="rounded-lg bg-red-900/30 p-4 text-red-200">{error}</div>
{:else}
  <!-- Top-level metric cards -->
  <div class="mb-8">
    <div class="rounded-lg bg-surface p-4 max-w-xs">
      <p class="text-xs font-semibold uppercase text-text">Total Users</p>
      <p class="mt-1 text-2xl font-bold text-text">{totalUsers}</p>
      <p class="text-xs text-text-muted">{adminCount} admin{adminCount !== 1 ? 's' : ''}</p>
    </div>
  </div>

  <!-- Recent Logins -->
  <div class="rounded-lg bg-surface p-5">
    <h2 class="mb-4 text-sm font-semibold uppercase text-text">Recent Logins</h2>
      {#if recentLogins.length === 0}
        <p class="text-sm text-text-muted">No logins recorded yet</p>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-border text-text">
                <th class="pb-2 font-medium">User</th>
                <th class="pb-2 font-medium">Email</th>
                <th class="pb-2 font-medium">Role</th>
                <th class="pb-2 font-medium">Last Login</th>
              </tr>
            </thead>
            <tbody>
              {#each recentLogins as user}
                <tr class="border-b border-border/50">
                  <td class="py-2 text-text">{user.name}</td>
                  <td class="py-2 text-text-muted">{user.email}</td>
                  <td class="py-2">
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium
                      {user.role === 'admin' ? 'bg-primary/20 text-primary' : 'bg-surface-dark text-text-muted'}">
                      {user.role}
                    </span>
                  </td>
                  <td class="py-2 text-text-muted">{new Date(user.lastLoginAt).toLocaleString()}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
  </div>
{/if}
