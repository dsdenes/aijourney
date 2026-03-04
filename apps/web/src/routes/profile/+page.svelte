<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte';
  import { api } from '$lib/api';
  import { comfortLevelFromPractices, TOTAL_PRACTICES } from '@aijourney/shared';

  interface MemoryFact {
    id: string;
    userId: string;
    fact: string;
    category: string;
    source: string;
    sourceExcerpt?: string;
    createdAt: string;
  }

  let profile = $state<any>(null);
  let loading = $state(true);
  let memoryFacts = $state<MemoryFact[]>([]);
  let memoryLoading = $state(true);
  let deletingFact = $state<string | null>(null);
  let clearingMemory = $state(false);

  $effect(() => {
    if (auth.user) {
      loadProfile();
      loadMemoryFacts();
    }
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

  async function loadMemoryFacts() {
    try {
      const res = await api.get<MemoryFact[]>(`/memory/facts/${auth.user?.userId}`);
      if (res.data) memoryFacts = res.data;
    } catch {
      // Silently fail — memory is supplementary
    } finally {
      memoryLoading = false;
    }
  }

  async function deleteFact(factId: string) {
    deletingFact = factId;
    try {
      await api.delete(`/memory/facts/${auth.user?.userId}/${factId}`);
      memoryFacts = memoryFacts.filter(f => f.id !== factId);
    } catch {
      // ignore
    } finally {
      deletingFact = null;
    }
  }

  async function clearAllMemory() {
    if (!confirm('Are you sure you want to clear all stored memory? This cannot be undone.')) return;
    clearingMemory = true;
    try {
      await api.delete(`/memory/facts/${auth.user?.userId}`);
      memoryFacts = [];
    } catch {
      // ignore
    } finally {
      clearingMemory = false;
    }
  }

  function changeRole() {
    goto('/onboarding?edit=true');
  }

  const completedPractices = $derived<number[]>(profile?.preferences?.completedPractices ?? []);
  const practiceCount = $derived(completedPractices.length);
  const comfortLevel = $derived(
    practiceCount > 0 ? comfortLevelFromPractices(practiceCount) : (profile?.preferences?.comfortLevel || '—')
  );

  // Group facts by category
  const factsByCategory = $derived(() => {
    const grouped: Record<string, MemoryFact[]> = {};
    for (const f of memoryFacts) {
      if (!grouped[f.category]) grouped[f.category] = [];
      grouped[f.category].push(f);
    }
    return grouped;
  });

  const categoryIcons: Record<string, string> = {
    preferences: '⚙️',
    goals: '🎯',
    skills: '🛠️',
    context: '📋',
    personality: '🧠',
  };

  const sourceLabels: Record<string, string> = {
    'ai-planner': 'AI Planner',
    'ai-chat': 'AI Chat',
    'prompt-optimizer': 'Prompt Optimizer',
  };
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
          <p class="text-lg text-text">{comfortLevel}</p>
          {#if practiceCount > 0}
            <p class="text-xs text-text-muted">{practiceCount}/{TOTAL_PRACTICES} prompting practices completed</p>
          {/if}
        </div>
      </div>

      <!-- Change Role button -->
      <div class="mt-6 border-t border-border pt-4">
        <button
          onclick={changeRole}
          class="rounded-lg border border-primary bg-transparent px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
        >
          🔄 Change Job Title & Description
        </button>
      </div>
    </div>

    <!-- Memory Facts Section -->
    <div class="mt-6 rounded-xl bg-surface p-6 shadow-sm ring-1 ring-border">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-text">🧠 AI Memory</h2>
          <p class="mt-0.5 text-sm text-text-muted">Facts the AI has learned about you from your interactions</p>
        </div>
        {#if memoryFacts.length > 0}
          <button
            onclick={clearAllMemory}
            disabled={clearingMemory}
            class="rounded-lg border border-danger/50 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
          >
            {clearingMemory ? 'Clearing...' : 'Clear All'}
          </button>
        {/if}
      </div>

      {#if memoryLoading}
        <div class="flex items-center justify-center py-8">
          <div class="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent"></div>
        </div>
      {:else if memoryFacts.length === 0}
        <div class="rounded-lg bg-surface-dark p-6 text-center">
          <p class="text-sm text-text-faint">No memories stored yet.</p>
          <p class="mt-1 text-xs text-text-faint">As you use AI features, the system will learn relevant facts about you to personalize your experience.</p>
        </div>
      {:else}
        <div class="space-y-4">
          {#each Object.entries(factsByCategory()) as [category, facts]}
            <div>
              <h3 class="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text">
                <span>{categoryIcons[category] || '📦'}</span>
                <span class="capitalize">{category}</span>
                <span class="ml-1 rounded-full bg-surface-dark px-2 py-0.5 text-xs font-normal text-text-faint">{facts.length}</span>
              </h3>
              <div class="space-y-1.5">
                {#each facts as fact (fact.id)}
                  <div class="group flex items-start gap-2 rounded-lg bg-surface-dark px-3 py-2 transition-colors hover:bg-surface-dark/80">
                    <p class="flex-1 text-sm text-text">{fact.fact}</p>
                    <div class="flex shrink-0 items-center gap-2">
                      <span class="text-[10px] text-text-faint">{sourceLabels[fact.source] || fact.source}</span>
                      <button
                        onclick={() => deleteFact(fact.id)}
                        disabled={deletingFact === fact.id}
                        class="opacity-0 group-hover:opacity-100 rounded p-0.5 text-text-faint hover:text-danger transition-all disabled:opacity-50"
                        title="Remove this fact"
                      >
                        {deletingFact === fact.id ? '...' : '✕'}
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
        <p class="mt-4 text-xs text-text-faint">{memoryFacts.length} fact{memoryFacts.length === 1 ? '' : 's'} stored across {Object.keys(factsByCategory()).length} categories</p>
      {/if}
    </div>
  {:else}
    <p class="text-text-muted">Could not load profile.</p>
  {/if}
</div>
