<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import { api } from '$lib/api';

  let profile = $state<any>(null);
  let loading = $state(true);

  $effect(() => {
    if (auth.user) loadProfile();
  });

  async function loadProfile() {
    try {
      const res = await api.get(`/users/${auth.user?.userId}`);
      profile = res.data;
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      loading = false;
    }
  }
</script>

<div>
  <h1 class="mb-8 text-3xl font-bold text-text">Profile</h1>

  {#if loading}
    <div class="flex items-center justify-center py-24">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
    </div>
  {:else if profile}
    <div class="rounded-xl bg-surface p-6 shadow-sm ring-1 ring-border">
      <div class="space-y-4">
        <div>
          <span class="text-sm font-semibold text-text">Name</span>
          <p class="text-lg text-text">{profile.name}</p>
        </div>
        <div>
          <span class="text-sm font-semibold text-text">Email</span>
          <p class="text-lg text-text">{profile.email}</p>
        </div>
        <div>
          <span class="text-sm font-semibold text-text">Department</span>
          <p class="text-lg text-text">{profile.department || '—'}</p>
        </div>
        <div>
          <span class="text-sm font-semibold text-text">Job Title</span>
          <p class="text-lg text-text">{profile.jobTitle || '—'}</p>
        </div>
        <div>
          <span class="text-sm font-semibold text-text">Role Description</span>
          <p class="text-sm text-text">{profile.jobDescription || '—'}</p>
        </div>
        <div>
          <span class="text-sm font-semibold text-text">Role</span>
          <p class="text-lg text-text">{profile.role || '—'}</p>
        </div>
        <div>
          <span class="text-sm font-semibold text-text">AI Comfort Level</span>
          <p class="text-lg text-text">{profile.preferences?.comfortLevel || '—'}</p>
        </div>
      </div>
    </div>
  {:else}
    <p class="text-text-muted">Could not load profile.</p>
  {/if}
</div>
