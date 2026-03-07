<script lang="ts">
  import '../app.css';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';

  let { children } = $props();

  const isAuthCallback = $derived(page.url.pathname.startsWith('/auth/'));
  const isOnboarding = $derived(page.url.pathname === '/onboarding');
  const needsOnboarding = $derived(
    auth.user && !auth.user.onboardingComplete && !isAuthCallback && !isOnboarding
  );

  $effect(() => {
    if (needsOnboarding) {
      goto('/onboarding');
    }
  });
</script>

<div class="flex h-screen bg-surface-dark">
  {#if isAuthCallback}
    {@render children()}
  {:else if auth.user && isOnboarding}
    <main class="flex-1 overflow-y-auto">
      <div class="mx-auto max-w-6xl p-6">
        {@render children()}
      </div>
    </main>
  {:else if auth.user}
    <Sidebar />
    <main class="flex-1 overflow-y-auto">
      <div class="mx-auto max-w-6xl p-6">
        <AppHeader />
        {@render children()}
      </div>
    </main>
  {:else}
    <div class="flex flex-1 items-center justify-center">
      <div class="text-center">
        <h1 class="mb-4 text-4xl font-bold text-text">AI Journey</h1>
        <p class="mb-8 text-text-muted">
          Personalized AI experimentation journeys
        </p>
        <button
          onclick={() => auth.login()}
          class="rounded-lg bg-primary px-6 py-3 text-white transition-colors hover:bg-primary-dark"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  {/if}
</div>
