<script lang="ts">
  import { api } from '$lib/api';
  import { auth } from '$lib/stores/auth.svelte';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import { addElapsedTime, getAverageTime } from '$lib/stores/elapsed-times';
  import type { TimingKey } from '$lib/stores/elapsed-times';

  type Step = 'input' | 'analyzing' | 'goals' | 'optimizing' | 'result';

  let step = $state<Step>('input');
  let prompt = $state('');
  let error = $state('');

  // Step 1 results
  let score = $state(0);
  let scoreExplanation = $state('');
  let goals = $state<{ id: number; label: string; description: string }[]>([]);

  // Step 3: chosen goal (editable)
  let selectedGoal = $state('');
  let editingGoal = $state(false);

  // Step 4 results
  let optimizedPrompt = $state('');
  let changes = $state<string[]>([]);
  let newScore = $state(0);
  let copied = $state(false);

  // Progress bar state
  let loadingDone = $state(false);
  let currentEstimateMs = $state(10000);

  /** Helper: timed API call that records elapsed time */
  async function timedPost<T>(path: string, body: unknown, key: TimingKey): Promise<{ data?: T; error?: { message: string } }> {
    const start = Date.now();
    try {
      const res = await api.post<T>(path, body);
      addElapsedTime(key, Date.now() - start);
      return res;
    } catch (err) {
      addElapsedTime(key, Date.now() - start);
      throw err;
    }
  }

  function getScoreColor(s: number) {
    if (s >= 75) return 'text-success';
    if (s >= 50) return 'text-warning';
    if (s >= 25) return 'text-primary';
    return 'text-danger';
  }

  function getScoreLabel(s: number) {
    if (s >= 80) return 'Excellent';
    if (s >= 60) return 'Good';
    if (s >= 40) return 'Fair';
    if (s >= 20) return 'Needs Work';
    return 'Poor';
  }

  function getScoreBg(s: number) {
    if (s >= 75) return 'bg-success/10 ring-success/30';
    if (s >= 50) return 'bg-warning/10 ring-warning/30';
    if (s >= 25) return 'bg-primary/10 ring-primary/30';
    return 'bg-danger/10 ring-danger/30';
  }

  async function analyzePrompt() {
    if (!prompt.trim()) return;
    error = '';
    loadingDone = false;
    currentEstimateMs = getAverageTime('optimizer:analyze', 12000);
    step = 'analyzing';

    try {
      const res = await timedPost<{
        score: number;
        scoreExplanation: string;
        goals: { id: number; label: string; description: string }[];
      }>('/prompt-optimizer/analyze', { prompt: prompt.trim(), userId: auth.user?.userId }, 'optimizer:analyze');

      loadingDone = true;
      if (res.data) {
        score = res.data.score;
        scoreExplanation = res.data.scoreExplanation;
        goals = res.data.goals;
        step = 'goals';
      }
    } catch (err: unknown) {
      loadingDone = true;
      error = err instanceof Error ? err.message : 'Analysis failed';
      step = 'input';
    }
  }

  function chooseGoal(goalDescription: string) {
    selectedGoal = goalDescription;
    editingGoal = false;
    optimizeWithGoal();
  }

  async function optimizeWithGoal() {
    error = '';
    loadingDone = false;
    currentEstimateMs = getAverageTime('optimizer:optimize', 15000);
    step = 'optimizing';

    try {
      const res = await timedPost<{
        optimizedPrompt: string;
        changes: string[];
        newScore: number;
      }>('/prompt-optimizer/optimize', {
        prompt: prompt.trim(),
        goal: selectedGoal,
        userId: auth.user?.userId,
      }, 'optimizer:optimize');

      loadingDone = true;
      if (res.data) {
        optimizedPrompt = res.data.optimizedPrompt;
        changes = res.data.changes;
        newScore = res.data.newScore;
        step = 'result';
      }
    } catch (err: unknown) {
      loadingDone = true;
      error = err instanceof Error ? err.message : 'Optimization failed';
      step = 'goals';
    }
  }

  function startOver() {
    step = 'input';
    prompt = '';
    score = 0;
    scoreExplanation = '';
    goals = [];
    selectedGoal = '';
    optimizedPrompt = '';
    changes = [];
    newScore = 0;
    error = '';
    copied = false;
  }

  function backToGoals() {
    step = 'goals';
    error = '';
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(optimizedPrompt);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    } catch {
      // fallback
    }
  }
</script>

<div class="mx-auto max-w-3xl">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-text">Optimize My Prompt</h1>
    <p class="mt-2 text-text-muted">
      Paste your prompt, get a quality score, and receive an optimized version.
    </p>
  </div>

  <!-- Progress Steps -->
  <div class="mb-8 flex items-center justify-center gap-2">
    {#each [
      { key: 'input', label: 'Your Prompt', num: 1 },
      { key: 'goals', label: 'Choose Goal', num: 2 },
      { key: 'result', label: 'Optimized', num: 3 },
    ] as s (s.key)}
      {@const active = (s.key === 'input' && (step === 'input' || step === 'analyzing'))
        || (s.key === 'goals' && (step === 'goals' || step === 'optimizing'))
        || (s.key === 'result' && step === 'result')}
      {@const done = (s.key === 'input' && step !== 'input' && step !== 'analyzing')
        || (s.key === 'goals' && step === 'result')}
      <div class="flex items-center gap-2">
        <span class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold
          {active ? 'bg-primary text-white' : done ? 'bg-success text-white' : 'bg-surface-darker text-text-faint'}">
          {done ? '✓' : s.num}
        </span>
        <span class="text-sm font-medium {active ? 'text-text' : 'text-text-faint'}">{s.label}</span>
      </div>
      {#if s.num < 3}
        <div class="h-px w-12 {done ? 'bg-success' : 'bg-border'}"></div>
      {/if}
    {/each}
  </div>

  <!-- Error banner -->
  {#if error}
    <div class="mb-4 rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
      {error}
    </div>
  {/if}

  <!-- STEP 1: Input -->
  {#if step === 'input' || step === 'analyzing'}
    <div class="rounded-xl bg-surface p-6 shadow-sm ring-1 ring-border">
      <label for="prompt-input" class="mb-2 block text-sm font-semibold text-text">
        Paste your prompt here
      </label>
      <textarea
        id="prompt-input"
        bind:value={prompt}
        placeholder="e.g. Write me an email about the project..."
        rows="6"
        disabled={step === 'analyzing'}
        class="w-full resize-y rounded-lg border border-border bg-surface-dark px-4 py-3 text-text placeholder-text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
      ></textarea>
      <div class="mt-4 flex items-center justify-between">
        <span class="text-xs text-text-faint">
          {prompt.length > 0 ? `${prompt.trim().split(/\s+/).length} words` : 'Type or paste your prompt'}
        </span>
        <button
          onclick={analyzePrompt}
          disabled={!prompt.trim() || step === 'analyzing'}
          class="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if step === 'analyzing'}
            <span class="inline-flex items-center gap-2">
              <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
              Analyzing...
            </span>
          {:else}
            Analyze Prompt
          {/if}
        </button>
      </div>
      {#if step === 'analyzing'}
        <div class="mt-4">
          <ProgressBar
            estimatedMs={currentEstimateMs}
            done={loadingDone}
            label="Analyzing your prompt..."
          />
        </div>
      {/if}
    </div>
  {/if}

  <!-- STEP 2: Score + Goals -->
  {#if step === 'goals' || step === 'optimizing'}
    <!-- Score Display -->
    <div class="mb-6 rounded-xl {getScoreBg(score)} p-6 ring-1">
      <div class="flex items-center gap-6">
        <div class="text-center">
          <div class="text-5xl font-bold {getScoreColor(score)}">{score}</div>
          <div class="mt-1 text-sm font-medium {getScoreColor(score)}">{getScoreLabel(score)}</div>
        </div>
        <div class="flex-1">
          <h3 class="mb-1 text-sm font-semibold text-text">Prompt Quality Score</h3>
          <p class="text-sm text-text-muted">{scoreExplanation}</p>
          <div class="mt-3">
            <button
              onclick={() => { step = 'input'; }}
              class="text-xs text-primary hover:underline"
            >
              ← Edit my prompt
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Your original prompt -->
    <div class="mb-6 rounded-lg bg-surface-dark p-4">
      <div class="mb-1 text-xs font-semibold text-text-faint">YOUR ORIGINAL PROMPT</div>
      <p class="text-sm text-text">{prompt}</p>
    </div>

    <!-- Goal selection / editing -->
    {#if !editingGoal}
      <div class="rounded-xl bg-surface p-6 shadow-sm ring-1 ring-border">
        <h3 class="mb-1 text-lg font-semibold text-text">What are you trying to achieve?</h3>
        <p class="mb-4 text-sm text-text-muted">Pick the goal that best matches your intent, or edit it to be more precise.</p>

        <div class="space-y-3">
          {#each goals as goal (goal.id)}
            <button
              onclick={() => chooseGoal(goal.description)}
              disabled={step === 'optimizing'}
              class="flex w-full items-start gap-3 rounded-lg border border-border p-4 text-left transition-all hover:border-primary hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {goal.id}
              </span>
              <div>
                <div class="font-semibold text-text">{goal.label}</div>
                <div class="mt-0.5 text-sm text-text-muted">{goal.description}</div>
              </div>
            </button>
          {/each}
        </div>

        <div class="mt-4 border-t border-border pt-4">
          <button
            onclick={() => { editingGoal = true; selectedGoal = ''; }}
            disabled={step === 'optimizing'}
            class="text-sm text-primary hover:underline disabled:opacity-50"
          >
            ✏️ Write my own goal instead
          </button>
        </div>

        {#if step === 'optimizing'}
          <ProgressBar
            estimatedMs={currentEstimateMs}
            done={loadingDone}
            label="Optimizing your prompt..."
          />
        {/if}
      </div>
    {:else}
      <!-- Custom goal editing -->
      <div class="rounded-xl bg-surface p-6 shadow-sm ring-1 ring-border">
        <h3 class="mb-1 text-lg font-semibold text-text">Describe your goal</h3>
        <p class="mb-4 text-sm text-text-muted">What exactly do you want to achieve with this prompt?</p>
        <textarea
          bind:value={selectedGoal}
          placeholder="e.g. I want to write a follow-up email to a client who hasn't responded in 2 weeks..."
          rows="3"
          class="w-full resize-y rounded-lg border border-border bg-surface-dark px-4 py-3 text-sm text-text placeholder-text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        ></textarea>
        <div class="mt-3 flex gap-3">
          <button
            onclick={() => { editingGoal = false; }}
            class="rounded-lg bg-surface-darker px-4 py-2 text-sm text-text-muted hover:bg-surface-dark"
          >
            ← Back to suggestions
          </button>
          <button
            onclick={optimizeWithGoal}
            disabled={!selectedGoal.trim()}
            class="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Optimize Prompt
          </button>
        </div>
      </div>
    {/if}
  {/if}

  <!-- STEP 3: Result -->
  {#if step === 'result'}
    <!-- Score comparison -->
    <div class="mb-6 flex items-center justify-center gap-4">
      <div class="rounded-xl {getScoreBg(score)} px-6 py-4 text-center ring-1">
        <div class="text-xs font-semibold text-text-faint">BEFORE</div>
        <div class="text-3xl font-bold {getScoreColor(score)}">{score}</div>
      </div>
      <div class="text-2xl text-text-faint">→</div>
      <div class="rounded-xl {getScoreBg(newScore)} px-6 py-4 text-center ring-1">
        <div class="text-xs font-semibold text-text-faint">AFTER</div>
        <div class="text-3xl font-bold {getScoreColor(newScore)}">{newScore}</div>
      </div>
    </div>

    <!-- Original vs Optimized -->
    <div class="mb-6 grid gap-4 md:grid-cols-2">
      <div class="rounded-xl bg-surface p-5 ring-1 ring-border">
        <div class="mb-2 text-xs font-semibold text-text-faint">YOUR ORIGINAL</div>
        <p class="text-sm text-text-muted">{prompt}</p>
      </div>
      <div class="rounded-xl bg-primary/5 p-5 ring-1 ring-primary/20">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-xs font-semibold text-primary">OPTIMIZED</span>
          <button
            onclick={copyToClipboard}
            class="rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>
        <p class="whitespace-pre-line text-sm text-text">{optimizedPrompt}</p>
      </div>
    </div>

    <!-- What changed -->
    {#if changes.length > 0}
      <div class="mb-6 rounded-xl bg-surface p-5 ring-1 ring-border">
        <h3 class="mb-3 text-sm font-semibold text-text">What was improved</h3>
        <ul class="space-y-2">
          {#each changes as change}
            <li class="flex items-start gap-2 text-sm text-text-muted">
              <span class="mt-0.5 text-success">✓</span>
              {change}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- Actions -->
    <div class="flex gap-3">
      <button
        onclick={backToGoals}
        class="rounded-lg bg-surface px-4 py-2.5 text-sm font-medium text-text-muted ring-1 ring-border hover:bg-surface-dark"
      >
        ← Try a different goal
      </button>
      <button
        onclick={startOver}
        class="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Optimize another prompt
      </button>
    </div>
  {/if}
</div>
