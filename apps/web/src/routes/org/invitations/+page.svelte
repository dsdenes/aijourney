<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';

  const API_BASE = import.meta.env.VITE_API_URL || '/api';

  let invitations = $state<Array<Record<string, unknown>>>([]);
  let loading = $state(true);
  let error = $state('');
  let inviteEmail = $state('');
  let inviteRole = $state('member');
  let bulkEmails = $state('');
  let showBulk = $state(false);
  let sending = $state(false);
  let successMessage = $state('');

  async function loadInvitations() {
    try {
      const res = await fetch(`${API_BASE}/invitations`, {
        headers: { Authorization: `Bearer ${auth.user?.token}` },
      });
      if (res.ok) {
        const { data } = await res.json();
        invitations = data || [];
      }
    } catch {
      error = 'Failed to load invitations';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (auth.user?.token) loadInvitations();
  });

  async function sendInvite() {
    if (!inviteEmail.trim()) return;
    sending = true;
    error = '';
    successMessage = '';

    try {
      const res = await fetch(`${API_BASE}/invitations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.user?.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: inviteEmail.trim(), orgRole: inviteRole }),
      });

      if (res.ok) {
        successMessage = `Invitation sent to ${inviteEmail}`;
        inviteEmail = '';
        await loadInvitations();
      } else {
        const body = await res.json().catch(() => ({}));
        error = body.error?.message || 'Failed to send invitation';
      }
    } catch {
      error = 'Failed to connect to server';
    } finally {
      sending = false;
    }
  }

  async function sendBulkInvites() {
    const emails = bulkEmails.split(/[,\n]/).map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) return;
    sending = true;
    error = '';
    successMessage = '';

    try {
      const res = await fetch(`${API_BASE}/invitations/bulk`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.user?.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emails, orgRole: inviteRole }),
      });

      if (res.ok) {
        const { data } = await res.json();
        successMessage = `${data.sent} invitation(s) sent, ${data.skipped} skipped`;
        bulkEmails = '';
        await loadInvitations();
      } else {
        const body = await res.json().catch(() => ({}));
        error = body.error?.message || 'Failed to send invitations';
      }
    } catch {
      error = 'Failed to connect to server';
    } finally {
      sending = false;
    }
  }

  async function revokeInvitation(id: string) {
    try {
      await fetch(`${API_BASE}/invitations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth.user?.token}` },
      });
      await loadInvitations();
    } catch {
      error = 'Failed to revoke invitation';
    }
  }
</script>

<div class="space-y-6">
  <!-- Invite form -->
  <div class="rounded-lg border border-border bg-surface p-6">
    <h2 class="text-lg font-semibold text-text">Invite Members</h2>

    {#if successMessage}
      <div class="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{successMessage}</div>
    {/if}

    {#if error}
      <div class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
    {/if}

    <div class="mt-4 flex items-center gap-3">
      <select
        bind:value={inviteRole}
        class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
      >
        <option value="member">Member</option>
        <option value="admin">Admin</option>
      </select>

      <button
        onclick={() => (showBulk = !showBulk)}
        class="text-sm text-primary hover:text-primary-dark"
      >
        {showBulk ? 'Single invite' : 'Bulk invite'}
      </button>
    </div>

    {#if showBulk}
      <div class="mt-3">
        <textarea
          bind:value={bulkEmails}
          placeholder="Enter email addresses, one per line or comma-separated"
          rows={4}
          class="w-full rounded-lg border border-border bg-surface p-3 text-sm text-text placeholder-text-muted"
        ></textarea>
        <button
          onclick={sendBulkInvites}
          disabled={sending || !bulkEmails.trim()}
          class="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send Invitations'}
        </button>
      </div>
    {:else}
      <form class="mt-3 flex gap-3" onsubmit={(e) => { e.preventDefault(); sendInvite(); }}>
        <input
          bind:value={inviteEmail}
          type="email"
          placeholder="colleague@example.com"
          class="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder-text-muted"
        />
        <button
          type="submit"
          disabled={sending || !inviteEmail.trim()}
          class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send Invite'}
        </button>
      </form>
    {/if}
  </div>

  <!-- Pending invitations -->
  <div class="rounded-lg border border-border bg-surface p-6">
    <h2 class="text-lg font-semibold text-text">Pending Invitations</h2>

    {#if loading}
      <p class="mt-4 text-sm text-text-muted">Loading...</p>
    {:else if invitations.length === 0}
      <p class="mt-4 text-sm text-text-muted">No pending invitations</p>
    {:else}
      <div class="mt-4 space-y-3">
        {#each invitations as inv}
          <div class="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p class="text-sm font-medium text-text">{inv.email}</p>
              <p class="text-xs text-text-muted">
                Role: {inv.orgRole} · Expires: {new Date(inv.expiresAt as string).toLocaleDateString()}
                · Status: <span class="font-medium
                  {inv.status === 'pending' ? 'text-yellow-600' :
                   inv.status === 'accepted' ? 'text-green-600' : 'text-red-600'}">{inv.status}</span>
              </p>
            </div>
            {#if inv.status === 'pending'}
              <button
                onclick={() => revokeInvitation(inv.id as string)}
                class="rounded px-3 py-1 text-sm text-red-600 transition-colors hover:bg-red-50"
              >
                Revoke
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
