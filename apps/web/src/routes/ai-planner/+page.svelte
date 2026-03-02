<script lang="ts">
  import { api } from '$lib/api';

  interface PlannerQuestion {
    id: number;
    question: string;
  }

  interface PlannerAnswer {
    id: number;
    question: string;
    answer: boolean;
    context?: string;
  }

  interface StrategyStep {
    order: number;
    title: string;
    description: string;
    aiRole: string;
  }

  interface StrategyTool {
    name: string;
    description: string;
    url?: string;
  }

  interface Strategy {
    title: string;
    summary: string;
    steps: StrategyStep[];
    examplePrompt: string;
    recommendedTools: StrategyTool[];
    tips: string[];
  }

  type Step = 'input' | 'loading-q' | 'round1' | 'round2' | 'round3' | 'loading-strategy' | 'strategy';

  let step = $state<Step>('input');
  let goal = $state('');
  let error = $state('');

  // Questions for each round
  let round1Questions = $state<PlannerQuestion[]>([]);
  let round2Questions = $state<PlannerQuestion[]>([]);
  let round3Questions = $state<PlannerQuestion[]>([]);

  // Selections (true = selected)
  let round1Selections = $state<Record<number, boolean>>({});
  let round2Selections = $state<Record<number, boolean>>({});
  let round3Selections = $state<Record<number, boolean>>({});

  // Extra context per question
  let round1Context = $state<Record<number, string>>({});
  let round2Context = $state<Record<number, string>>({});
  let round3Context = $state<Record<number, string>>({});

  // Final strategy
  let strategy = $state<Strategy | null>(null);
  let promptCopied = $state(false);

  function getAnswers(questions: PlannerQuestion[], selections: Record<number, boolean>, contexts: Record<number, string> = {}): PlannerAnswer[] {
    return questions.map(q => ({
      id: q.id,
      question: q.question,
      answer: !!selections[q.id],
      ...(contexts[q.id]?.trim() ? { context: contexts[q.id].trim() } : {}),
    }));
  }

  function getAllAnswers(): PlannerAnswer[] {
    return [
      ...getAnswers(round1Questions, round1Selections, round1Context),
      ...getAnswers(round2Questions, round2Selections, round2Context),
      ...getAnswers(round3Questions, round3Selections, round3Context),
    ];
  }

  function selectedCount(selections: Record<number, boolean>): number {
    return Object.values(selections).filter(Boolean).length;
  }

  // Step 1 → Round 1
  async function submitGoal() {
    if (!goal.trim()) return;
    error = '';
    step = 'loading-q';

    try {
      const res = await api.post<{ round: number; questions: PlannerQuestion[] }>('/ai-planner/questions', {
        goal: goal.trim(),
        round: 1,
        previousAnswers: [],
      });

      if (res.data) {
        round1Questions = res.data.questions;
        round1Selections = {};
        round1Context = {};
        step = 'round1';
      } else if (res.error) {
        throw new Error(res.error.message);
      }
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Failed to generate questions';
      step = 'input';
    }
  }

  // Round 1 → Round 2
  async function submitRound1() {
    error = '';
    step = 'loading-q';

    try {
      const res = await api.post<{ round: number; questions: PlannerQuestion[] }>('/ai-planner/questions', {
        goal: goal.trim(),
        round: 2,
        previousAnswers: getAnswers(round1Questions, round1Selections, round1Context),
      });

      if (res.data) {
        round2Questions = res.data.questions;
        round2Selections = {};
        round2Context = {};
        step = 'round2';
      } else if (res.error) {
        throw new Error(res.error.message);
      }
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Failed to generate questions';
      step = 'round1';
    }
  }

  // Round 2 → Round 3
  async function submitRound2() {
    error = '';
    step = 'loading-q';

    try {
      const answers = [
        ...getAnswers(round1Questions, round1Selections, round1Context),
        ...getAnswers(round2Questions, round2Selections, round2Context),
      ];
      const res = await api.post<{ round: number; questions: PlannerQuestion[] }>('/ai-planner/questions', {
        goal: goal.trim(),
        round: 3,
        previousAnswers: answers,
      });

      if (res.data) {
        round3Questions = res.data.questions;
        round3Selections = {};
        round3Context = {};
        step = 'round3';
      } else if (res.error) {
        throw new Error(res.error.message);
      }
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Failed to generate questions';
      step = 'round2';
    }
  }

  // Round 3 → Strategy
  async function submitRound3() {
    error = '';
    step = 'loading-strategy';

    try {
      const res = await api.post<Strategy>('/ai-planner/strategy', {
        goal: goal.trim(),
        answers: getAllAnswers(),
      });

      if (res.data) {
        strategy = res.data;
        step = 'strategy';
      } else if (res.error) {
        throw new Error(res.error.message);
      }
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Failed to generate strategy';
      step = 'round3';
    }
  }

  async function copyPrompt() {
    if (!strategy?.examplePrompt) return;
    try {
      await navigator.clipboard.writeText(strategy.examplePrompt);
      promptCopied = true;
      setTimeout(() => { promptCopied = false; }, 2000);
    } catch { /* fallback */ }
  }

  function startOver() {
    step = 'input';
    goal = '';
    error = '';
    round1Questions = [];
    round2Questions = [];
    round3Questions = [];
    round1Selections = {};
    round2Selections = {};
    round3Selections = {};
    round1Context = {};
    round2Context = {};
    round3Context = {};
    strategy = null;
    promptCopied = false;
  }

  function currentRoundNum(): number {
    if (step === 'input' || step === 'loading-q') return 0;
    if (step === 'round1') return 1;
    if (step === 'round2') return 2;
    if (step === 'round3') return 3;
    if (step === 'loading-strategy' || step === 'strategy') return 4;
    return 0;
  }
</script>

<div class="mx-auto max-w-3xl">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-text">AI Planner</h1>
    <p class="mt-2 text-text-muted">
      Describe your project, answer specification questions, and get a personalized AI strategy.
    </p>
  </div>

  <!-- Progress Steps -->
  <div class="mb-8 flex items-center justify-center gap-1.5">
    {#each [
      { key: 1, label: 'Goal' },
      { key: 2, label: 'Round 1' },
      { key: 3, label: 'Round 2' },
      { key: 4, label: 'Round 3' },
      { key: 5, label: 'Strategy' },
    ] as s (s.key)}
      {@const roundNum = currentRoundNum()}
      {@const active = (s.key === 1 && (step === 'input' || step === 'loading-q'))
        || (s.key === 2 && step === 'round1')
        || (s.key === 3 && step === 'round2')
        || (s.key === 4 && step === 'round3')
        || (s.key === 5 && (step === 'loading-strategy' || step === 'strategy'))}
      {@const done = (s.key === 1 && roundNum >= 1)
        || (s.key === 2 && roundNum >= 2)
        || (s.key === 3 && roundNum >= 3)
        || (s.key === 4 && roundNum >= 4)
        || (s.key === 5 && step === 'strategy')}
      <div class="flex items-center gap-1.5">
        <div class="flex flex-col items-center gap-1">
          <span class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold
            {active ? 'bg-primary text-white' : done ? 'bg-success text-white' : 'bg-surface-darker text-text-faint'}">
            {done && !active ? '✓' : s.key}
          </span>
          <span class="text-[10px] font-medium {active ? 'text-text' : 'text-text-faint'}">{s.label}</span>
        </div>
      </div>
      {#if s.key < 5}
        <div class="mb-4 h-px w-8 {done && !active ? 'bg-success' : 'bg-border'}"></div>
      {/if}
    {/each}
  </div>

  <!-- Error banner -->
  {#if error}
    <div class="mb-4 rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
      {error}
    </div>
  {/if}

  <!-- STEP 1: Goal Input -->
  {#if step === 'input' || step === 'loading-q' && round1Questions.length === 0}
    <div class="rounded-xl bg-surface p-6 shadow-sm ring-1 ring-border">
      <label for="goal-input" class="mb-2 block text-sm font-semibold text-text">
        Describe your project goal
      </label>
      <p class="mb-3 text-sm text-text-muted">
        What complex project do you want to use AI for? Be as detailed as possible.
      </p>
      <textarea
        id="goal-input"
        bind:value={goal}
        placeholder="e.g. I want to automate our customer onboarding process. Currently, new customers fill out a form, then our team manually reviews it, creates an account, and sends a welcome email with personalized resources..."
        rows="6"
        disabled={step === 'loading-q'}
        class="w-full resize-y rounded-lg border border-border bg-surface-dark px-4 py-3 text-text placeholder-text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
      ></textarea>
      <div class="mt-4 flex items-center justify-between">
        <span class="text-xs text-text-faint">
          {goal.length > 0 ? `${goal.trim().split(/\s+/).length} words` : 'Describe your project in detail'}
        </span>
        <button
          onclick={submitGoal}
          disabled={!goal.trim() || step === 'loading-q'}
          class="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if step === 'loading-q'}
            <span class="inline-flex items-center gap-2">
              <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
              Analyzing...
            </span>
          {:else}
            Start Planning
          {/if}
        </button>
      </div>
    </div>
  {/if}

  <!-- Loading questions (between rounds) -->
  {#if step === 'loading-q' && round1Questions.length > 0}
    <div class="flex flex-col items-center justify-center py-16">
      <div class="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      <p class="text-sm font-medium text-text-muted">Generating specification questions...</p>
    </div>
  {/if}

  <!-- ROUND 1/2/3: Question Selection -->
  {#if step === 'round1' || step === 'round2' || step === 'round3'}
    {@const roundNum = step === 'round1' ? 1 : step === 'round2' ? 2 : 3}
    {@const questions = step === 'round1' ? round1Questions : step === 'round2' ? round2Questions : round3Questions}
    {@const selections = step === 'round1' ? round1Selections : step === 'round2' ? round2Selections : round3Selections}
    {@const submitFn = step === 'round1' ? submitRound1 : step === 'round2' ? submitRound2 : submitRound3}
    {@const contexts = step === 'round1' ? round1Context : step === 'round2' ? round2Context : round3Context}
    {@const count = selectedCount(selections)}
    {@const roundDescriptions = {
      1: 'Select the statements that apply to your project. These help us understand the scope.',
      2: 'Based on your previous answers, here are more specific questions. Select what applies.',
      3: 'Final round of specification. Select what applies to finalize your strategy.',
    }}

    <!-- Goal recap -->
    <div class="mb-4 rounded-lg bg-surface-dark p-3">
      <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-faint">Your Goal</div>
      <p class="text-sm text-text line-clamp-2">{goal}</p>
    </div>

    <div class="rounded-xl bg-surface p-6 shadow-sm ring-1 ring-border">
      <div class="mb-1 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-text">Specification Round {roundNum} of 3</h2>
        <span class="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          {count} selected
        </span>
      </div>
      <p class="mb-5 text-sm text-text-muted">{roundDescriptions[roundNum as 1 | 2 | 3]}</p>

      <div class="grid gap-3">
        {#each questions as q (q.id)}
          {@const selected = !!selections[q.id]}
          <div class="rounded-lg border transition-all
            {selected
              ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
              : 'border-border hover:border-primary/50'}">
            <button
              onclick={() => {
                if (step === 'round1') round1Selections = { ...round1Selections, [q.id]: !selected };
                else if (step === 'round2') round2Selections = { ...round2Selections, [q.id]: !selected };
                else round3Selections = { ...round3Selections, [q.id]: !selected };
              }}
              class="flex w-full items-start gap-3 p-4 text-left"
            >
              <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs
                {selected ? 'border-primary bg-primary text-white' : 'border-text-faint/30'}">
                {selected ? '✓' : ''}
              </span>
              <span class="text-sm font-bold {selected ? 'text-text' : 'text-text-muted'}">{q.question}</span>
            </button>
            <div class="px-4 pb-3 pl-12">
              <textarea
                placeholder="Add context (optional)"
                rows="1"
                value={contexts[q.id] ?? ''}
                oninput={(e) => {
                  const val = (e.target as HTMLTextAreaElement).value;
                  if (step === 'round1') round1Context = { ...round1Context, [q.id]: val };
                  else if (step === 'round2') round2Context = { ...round2Context, [q.id]: val };
                  else round3Context = { ...round3Context, [q.id]: val };
                }}
                onfocus={(e) => { (e.target as HTMLTextAreaElement).rows = 3; }}
                onblur={(e) => { const t = e.target as HTMLTextAreaElement; if (!t.value.trim()) t.rows = 1; }}
                class="w-full resize-none rounded border border-border bg-surface-dark px-3 py-1.5 text-xs text-text placeholder-text-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
              ></textarea>
            </div>
          </div>
        {/each}
      </div>

      <div class="mt-6 flex items-center justify-between">
        <button
          onclick={() => {
            if (step === 'round1') { step = 'input'; }
            else if (step === 'round2') { step = 'round1'; }
            else { step = 'round2'; }
          }}
          class="text-sm text-text-muted hover:text-text"
        >
          ← Back
        </button>
        <button
          onclick={submitFn}
          class="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          {roundNum < 3 ? 'Next Round →' : 'Generate Strategy →'}
        </button>
      </div>
    </div>
  {/if}

  <!-- Loading strategy -->
  {#if step === 'loading-strategy'}
    <div class="flex flex-col items-center justify-center py-16">
      <div class="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      <p class="text-sm font-medium text-text-muted">Generating your AI strategy with Claude Sonnet...</p>
      <p class="mt-1 text-xs text-text-faint">This may take 15-30 seconds</p>
    </div>
  {/if}

  <!-- STEP 5: Strategy Result -->
  {#if step === 'strategy' && strategy}
    <!-- Strategy Header -->
    <div class="mb-6 rounded-xl bg-gradient-to-r from-primary/10 to-success/10 p-6 ring-1 ring-primary/20">
      <h2 class="text-2xl font-bold text-text">{strategy.title}</h2>
      <p class="mt-2 text-sm text-text-muted">{strategy.summary}</p>
    </div>

    <!-- Steps -->
    <div class="mb-6 rounded-xl bg-surface p-6 ring-1 ring-border">
      <h3 class="mb-4 text-sm font-semibold uppercase tracking-wider text-text-faint">Action Plan</h3>
      <div class="space-y-4">
        {#each strategy.steps as stepItem (stepItem.order)}
          <div class="flex gap-4">
            <div class="flex flex-col items-center">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                {stepItem.order}
              </span>
              {#if stepItem.order < strategy.steps.length}
                <div class="mt-1 h-full w-px bg-border"></div>
              {/if}
            </div>
            <div class="pb-4">
              <h4 class="font-semibold text-text">{stepItem.title}</h4>
              <p class="mt-1 text-sm text-text-muted">{stepItem.description}</p>
              <div class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-3 py-1 text-xs text-primary">
                <span>🤖</span>
                {stepItem.aiRole}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Example Prompt -->
    <div class="mb-6 rounded-xl bg-primary/5 p-6 ring-1 ring-primary/20">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-semibold uppercase tracking-wider text-primary">Ready-to-Use Prompt</h3>
        <button
          onclick={copyPrompt}
          class="rounded bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          {promptCopied ? '✓ Copied!' : '📋 Copy Prompt'}
        </button>
      </div>
      <div class="whitespace-pre-line rounded-lg bg-surface p-4 text-sm text-text ring-1 ring-border">
        {strategy.examplePrompt}
      </div>
    </div>

    <!-- Recommended Tools -->
    <div class="mb-6 rounded-xl bg-surface p-6 ring-1 ring-border">
      <h3 class="mb-4 text-sm font-semibold uppercase tracking-wider text-text-faint">Recommended Tools</h3>
      <div class="grid gap-3 sm:grid-cols-2">
        {#each strategy.recommendedTools as tool (tool.name)}
          <div class="rounded-lg border border-border p-4">
            <div class="flex items-center gap-2">
              <span class="text-lg">🛠️</span>
              <h4 class="font-semibold text-text">{tool.name}</h4>
            </div>
            <p class="mt-1 text-sm text-text-muted">{tool.description}</p>
            {#if tool.url}
              <a href={tool.url} target="_blank" rel="noopener noreferrer"
                class="mt-2 inline-block text-xs text-primary hover:underline">
                Visit →
              </a>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Tips -->
    <div class="mb-6 rounded-xl bg-success/5 p-6 ring-1 ring-success/20">
      <h3 class="mb-3 text-sm font-semibold uppercase tracking-wider text-success">Pro Tips</h3>
      <ul class="space-y-2">
        {#each strategy.tips as tip}
          <li class="flex items-start gap-2 text-sm text-text-muted">
            <span class="mt-0.5 text-success">💡</span>
            {tip}
          </li>
        {/each}
      </ul>
    </div>

    <!-- Spec Summary -->
    <details class="mb-6 rounded-xl bg-surface p-6 ring-1 ring-border">
      <summary class="cursor-pointer text-sm font-semibold text-text-faint hover:text-text">
        View your specification answers ({getAllAnswers().length} answers)
      </summary>
      <div class="mt-4 space-y-2">
        {#each getAllAnswers() as answer (answer.question)}
          <div class="flex items-start gap-2 text-sm">
            <span class="mt-0.5 shrink-0 {answer.answer ? 'text-success' : 'text-text-faint'}">
              {answer.answer ? '✓' : '✗'}
            </span>
            <div>
              <span class="text-text-muted">{answer.question}</span>
              {#if answer.context}
                <p class="mt-0.5 text-xs text-text-faint italic">"{answer.context}"</p>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </details>

    <!-- Actions -->
    <div class="flex gap-3">
      <button
        onclick={startOver}
        class="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Plan Another Project
      </button>
    </div>
  {/if}
</div>
