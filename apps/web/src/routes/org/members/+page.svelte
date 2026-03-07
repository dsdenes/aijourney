<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';

  const API_BASE = import.meta.env.VITE_API_URL || '/api';

  let members = $state<Array<Record<string, unknown>>>([]);
  let loading = $state(true);
  let error = $state('');

  async function loadMembers() {
    try {
      const res = await fetch(`${API_BASE}/users?scope=tenant`, {
        headers: { Authorization: `Bearer ${auth.user?.token}` },
      });
      if (res.ok) {
        const { data } = await res.json();
        members = data || [];
      } else {
        error = 'Failed to load members';
      }
    } catch {
      error = 'Failed to connect to server';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (auth.user?.token) loadMembers();
  });

  async function changeRole(userId: string, newRole: string) {
    try {
      await fetch(`${API_BASE}/users/${userId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${auth.user?.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orgRole: newRole }),
      });
      await loadMembers();
    } catch {
      error = 'Failed to update role';
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h2 class="text-lg font-semibold text-text">Team Members</h2>
    <a
      href="/org/invitations"
      class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
    >
      Invite Members
    </a>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <p class="text-text-muted">Loading members...</p>
    </div>
  {:else if error}
    <div class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">{error}</div>
  {:else}
    <div class="overflow-hidden rounded-lg border border-border">
      <table class="min-w-full divide-y divide-border">
        <thead class="bg-surface">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Name</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Email</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Role</th>
            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Last Login</th>
            {#if auth.user?.orgRole === 'owner'}
              <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Actions</th>
            {/if}
          </tr>
        </thead>
        <tbody class="divide-y divide-border bg-surface">
          {#each members as member}
            <tr>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-text">{member.name}</td>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-text-muted">{member.email}</td>
              <td class="whitespace-nowrap px-6 py-4">
                <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                  {member.orgRole === 'owner' ? 'bg-yellow-100 text-yellow-800' :
                   member.orgRole === 'admin' ? 'bg-blue-100 text-blue-800' :
                   'bg-gray-100 text-gray-800'}">
                  {member.orgRole}
                </span>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-text-muted">
                {member.lastLoginAt ? new Date(member.lastLoginAt as string).toLocaleDateString() : 'Never'}
              </td>
              {#if auth.user?.orgRole === 'owner' && member.id !== auth.user?.userId}
                <td class="whitespace-nowrap px-6 py-4 text-sm">
                  <select
                    class="rounded border border-border bg-surface px-2 py-1 text-sm text-text"
                    value={member.orgRole}
                    onchange={(e) => changeRole(member.id as string, (e.target as HTMLSelectElement).value)}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
