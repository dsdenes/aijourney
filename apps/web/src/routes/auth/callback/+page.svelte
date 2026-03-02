<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte';

  let error = $state('');
  let status = $state('Signing you in…');

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorParam = params.get('error');
    const errorDesc = params.get('error_description');

    if (errorParam) {
      error = errorDesc || errorParam;
      return;
    }

    if (!code) {
      error = 'No authorization code received';
      return;
    }

    try {
      status = 'Exchanging authorization code…';
      await auth.handleCallback(code);
      status = 'Success! Redirecting…';
      goto('/', { replaceState: true });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Authentication failed';
    }
  });
</script>

<div class="flex h-screen items-center justify-center bg-surface-dark">
  <div class="text-center">
    {#if error}
      <div class="mb-4 rounded-lg bg-red-900/50 p-4 text-red-200">
        <p class="font-semibold">Sign-in failed</p>
        <p class="mt-1 text-sm">{error}</p>
      </div>
      <button
        onclick={() => auth.login()}
        class="rounded-lg bg-primary px-6 py-3 text-white transition-colors hover:bg-primary-dark"
      >
        Try again
      </button>
    {:else}
      <div class="mb-4">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
      <p class="text-text-muted">{status}</p>
    {/if}
  </div>
</div>
