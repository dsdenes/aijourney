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

  interface RunRequest {
    id: string;
    userId: string;
    purpose: string;
    status: string;
    budget: { maxTokens: number; estimatedCostUsd: number };
    execution?: { tokensUsed?: number; actualCostUsd?: number; durationMs?: number };
    createdAt: string;
    updatedAt: string;
  }

  let users = $state<User[]>([]);
  let runs = $state<RunRequest[]>([]);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    try {
      const [usersRes, runsRes] = await Promise.all([
        api.get<User[]>('/users'),
        api.get<RunRequest[]>('/runs/all'),
      ]);
      users = usersRes.data || [];
      runs = runsRes.data || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load data';
    } finally {
      loading = false;
    }
  });

  // Derived metrics
  const totalUsers = $derived(users.length);
  const adminCount = $derived(users.filter(u => u.role === 'admin').length);
  const totalRuns = $derived(runs.length);
  const runsByStatus = $derived(() => {
    const counts: Record<string, number> = {};
    for (const r of runs) {
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
    return counts;
  });
  const runsByPurpose = $derived(() => {
    const counts: Record<string, number> = {};
    for (const r of runs) {
      counts[r.purpose] = (counts[r.purpose] || 0) + 1;
    }
    return counts;
  });
  const recentLogins = $derived(
    [...users]
      .filter(u => u.lastLoginAt)
      .sort((a, b) => b.lastLoginAt.localeCompare(a.lastLoginAt))
      .slice(0, 5)
  );

  const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-500/20 text-yellow-300',
    APPROVED: 'bg-blue-500/20 text-blue-300',
    RUNNING: 'bg-cyan-500/20 text-cyan-300',
    COMPLETED: 'bg-green-500/20 text-green-300',
    FAILED: 'bg-red-500/20 text-red-300',
    CANCELLED: 'bg-gray-500/20 text-gray-300',
    CANCEL_REQUESTED: 'bg-orange-500/20 text-orange-300',
    REJECTED: 'bg-red-500/20 text-red-300',
  };
</script>

{#if loading}
  <div class="flex items-center justify-center py-12">
    <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
  </div>
{:else if error}
  <div class="rounded-lg bg-red-900/30 p-4 text-red-200">{error}</div>
{:else}
  <!-- Top-level metric cards -->
  <div class="mb-8 grid grid-cols-2 gap-4">
    <div class="rounded-lg bg-surface p-4">
      <p class="text-xs font-semibold uppercase text-text">Total Users</p>
      <p class="mt-1 text-2xl font-bold text-text">{totalUsers}</p>
      <p class="text-xs text-text-muted">{adminCount} admin{adminCount !== 1 ? 's' : ''}</p>
    </div>
    <div class="rounded-lg bg-surface p-4">
      <p class="text-xs font-semibold uppercase text-text">Total Runs</p>
      <p class="mt-1 text-2xl font-bold text-text">{totalRuns}</p>
    </div>
  </div>

  <div class="grid gap-6 lg:grid-cols-2">
    <!-- Runs by Status -->
    <div class="rounded-lg bg-surface p-5">
      <h2 class="mb-4 text-sm font-semibold uppercase text-text">Runs by Status</h2>
      {#if Object.keys(runsByStatus()).length === 0}
        <p class="text-sm text-text-muted">No runs yet</p>
      {:else}
        <div class="space-y-2">
          {#each Object.entries(runsByStatus()).sort((a, b) => b[1] - a[1]) as [status, count]}
            <div class="flex items-center justify-between">
              <span class="rounded-full px-2.5 py-0.5 text-xs font-medium {statusColors[status] || 'bg-gray-500/20 text-gray-300'}">
                {status}
              </span>
              <div class="flex items-center gap-2">
                <div class="h-2 w-24 overflow-hidden rounded-full bg-surface-dark">
                  <div
                    class="h-full rounded-full bg-primary"
                    style="width: {totalRuns > 0 ? (count / totalRuns) * 100 : 0}%"
                  ></div>
                </div>
                <span class="w-8 text-right text-sm font-medium text-text">{count}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Runs by Purpose (Agent Type) -->
    <div class="rounded-lg bg-surface p-5">
      <h2 class="mb-4 text-sm font-semibold uppercase text-text">Runs by Agent Type</h2>
      {#if Object.keys(runsByPurpose()).length === 0}
        <p class="text-sm text-text-muted">No runs yet</p>
      {:else}
        <div class="space-y-2">
          {#each Object.entries(runsByPurpose()).sort((a, b) => b[1] - a[1]) as [purpose, count]}
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-text">{purpose}</span>
              <div class="flex items-center gap-2">
                <div class="h-2 w-24 overflow-hidden rounded-full bg-surface-dark">
                  <div
                    class="h-full rounded-full bg-accent"
                    style="width: {totalRuns > 0 ? (count / totalRuns) * 100 : 0}%"
                  ></div>
                </div>
                <span class="w-8 text-right text-sm font-medium text-text">{count}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Recent Logins -->
    <div class="rounded-lg bg-surface p-5 lg:col-span-2">
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
  </div>
{/if}
