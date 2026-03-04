<script lang="ts">
  import { api } from '$lib/api';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import { addElapsedTime, getAverageTime } from '$lib/stores/elapsed-times';
  import type { TimingKey } from '$lib/stores/elapsed-times';

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
    inputArtifacts?: string;
    outputArtifacts?: string;
    prompt: string;
  }

  interface Strategy {
    title: string;
    summary: string;
    startingState?: string;
    endResult?: string;
    nextSteps?: string;
    steps: StrategyStep[];
    tool: 'chatgpt';
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

  // Extra context per round
  let round1Context = $state('');
  let round2Context = $state('');
  let round3Context = $state('');

  // Final strategy
  let strategy = $state<Strategy | null>(null);

  // Highest completed step (1=goal submitted, 2=round1 done, 3=round2 done, 4=round3 done, 5=strategy done)
  let completedStep = $state(0);

  // Progress bar state
  let loadingDone = $state(false);
  let currentEstimateMs = $state(15000);

  // Funny rotating progress messages
  const funnyMessages = [
    'Consulting the AI oracle...',
    'Checking trendy barista websites for inspiration...',
    'Asking ChatGPT what it thinks about itself...',
    'Reticulating splines...',
    'Bribing the neural network with GPU cycles...',
    'Summoning the ghost of Alan Turing...',
    'Teaching robots to appreciate sarcasm...',
    'Downloading more RAM... just kidding...',
    'Politely asking the cloud for answers...',
    'Translating your vision into ones and zeros...',
    'Brewing a fresh pot of algorithm...',
    'Counting electric sheep...',
    'Running the hamster wheel powering our servers...',
    'Convincing the AI this is not a drill...',
    'Performing interpretive dance for the data center...',
    'Negotiating with the internet gremlins...',
    'Warming up the flux capacitor...',
    'Feeding the AI its morning coffee...',
    'Untangling the spaghetti of possibilities...',
    'Searching for the meaning of AI-life...',
  ];
  let copiedStepIndex = $state<number | null>(null);
  let feedback = $state('');
  let openStepIndex = $state<number | null>(null);

  async function copyStepPrompt(index: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedStepIndex = index;
      setTimeout(() => { copiedStepIndex = null; }, 2000);
    } catch { /* fallback */ }
  }

  async function regenerateStrategy() {
    if (!feedback.trim()) return;
    error = '';
    loadingDone = false;
    currentEstimateMs = getAverageTime('planner:strategy', 30000);
    step = 'loading-strategy';
    openStepIndex = null;

    try {
      const res = await timedPost<Strategy>('/ai-planner/strategy', {
        goal: goal.trim(),
        answers: getAllAnswers(),
        feedback: feedback.trim(),
      }, 'planner:strategy');

      loadingDone = true;
      if (res.data) {
        strategy = res.data;
        feedback = '';
        completedStep = 5;
        step = 'strategy';
      } else if (res.error) {
        throw new Error(res.error.message);
      }
    } catch (err: unknown) {
      loadingDone = true;
      error = err instanceof Error ? err.message : 'Failed to regenerate strategy';
      step = 'strategy';
    }
  }

  function getAnswers(questions: PlannerQuestion[], selections: Record<number, boolean>, roundContext: string = ''): PlannerAnswer[] {
    return questions.map((q, i) => ({
      id: q.id,
      question: q.question,
      answer: !!selections[q.id],
      ...(i === 0 && roundContext.trim() ? { context: roundContext.trim() } : {}),
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

  // Step 1 → Round 1
  async function submitGoal() {
    if (!goal.trim()) return;
    error = '';
    loadingDone = false;
    currentEstimateMs = getAverageTime('planner:questions', 12000);
    step = 'loading-q';

    try {
      const res = await timedPost<{ round: number; questions: PlannerQuestion[] }>('/ai-planner/questions', {
        goal: goal.trim(),
        round: 1,
        previousAnswers: [],
      }, 'planner:questions');

      loadingDone = true;
      if (res.data) {
        round1Questions = res.data.questions;
        round1Selections = {};
        round1Context = '';
        completedStep = 1;
        step = 'round1';
      } else if (res.error) {
        throw new Error(res.error.message);
      }
    } catch (err: unknown) {
      loadingDone = true;
      error = err instanceof Error ? err.message : 'Failed to generate questions';
      step = 'input';
    }
  }

  // Round 1 → Round 2
  async function submitRound1() {
    error = '';
    loadingDone = false;
    currentEstimateMs = getAverageTime('planner:questions', 12000);
    step = 'loading-q';

    try {
      const res = await timedPost<{ round: number; questions: PlannerQuestion[] }>('/ai-planner/questions', {
        goal: goal.trim(),
        round: 2,
        previousAnswers: getAnswers(round1Questions, round1Selections, round1Context),
      }, 'planner:questions');

      loadingDone = true;
      if (res.data) {
        round2Questions = res.data.questions;
        round2Selections = {};
        round2Context = '';
        completedStep = 2;
        step = 'round2';
      } else if (res.error) {
        throw new Error(res.error.message);
      }
    } catch (err: unknown) {
      loadingDone = true;
      error = err instanceof Error ? err.message : 'Failed to generate questions';
      step = 'round1';
    }
  }

  // Round 2 → Round 3
  async function submitRound2() {
    error = '';
    loadingDone = false;
    currentEstimateMs = getAverageTime('planner:questions', 12000);
    step = 'loading-q';

    try {
      const answers = [
        ...getAnswers(round1Questions, round1Selections, round1Context),
        ...getAnswers(round2Questions, round2Selections, round2Context),
      ];
      const res = await timedPost<{ round: number; questions: PlannerQuestion[] }>('/ai-planner/questions', {
        goal: goal.trim(),
        round: 3,
        previousAnswers: answers,
      }, 'planner:questions');

      loadingDone = true;
      if (res.data) {
        round3Questions = res.data.questions;
        round3Selections = {};
        round3Context = '';
        completedStep = 3;
        step = 'round3';
      } else if (res.error) {
        throw new Error(res.error.message);
      }
    } catch (err: unknown) {
      loadingDone = true;
      error = err instanceof Error ? err.message : 'Failed to generate questions';
      step = 'round2';
    }
  }

  // Round 3 → Strategy
  async function submitRound3() {
    error = '';
    loadingDone = false;
    currentEstimateMs = getAverageTime('planner:strategy', 30000);
    step = 'loading-strategy';
    openStepIndex = null;

    try {
      const res = await timedPost<Strategy>('/ai-planner/strategy', {
        goal: goal.trim(),
        answers: getAllAnswers(),
      }, 'planner:strategy');

      loadingDone = true;
      if (res.data) {
        strategy = res.data;
        completedStep = 5;
        step = 'strategy';
      } else if (res.error) {
        throw new Error(res.error.message);
      }
    } catch (err: unknown) {
      loadingDone = true;
      error = err instanceof Error ? err.message : 'Failed to generate strategy';
      step = 'round3';
    }
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
    round1Context = '';
    round2Context = '';
    round3Context = '';
    strategy = null;
    feedback = '';
    openStepIndex = null;
    completedStep = 0;
  }
</script>

<div class="mx-auto max-w-3xl">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-text">AI Action Planner</h1>
    <p class="mt-2 text-text-muted">
      Describe what you want to achieve, answer a few quick questions, and get ready-to-use ChatGPT prompts.
    </p>
  </div>

  <!-- Progress Steps -->
  <div class="mb-8 flex items-center justify-center gap-1.5">
    {#each [
      { key: 1, label: 'Goal' },
      { key: 2, label: 'Round 1' },
      { key: 3, label: 'Round 2' },
      { key: 4, label: 'Round 3' },
      { key: 5, label: 'Your Plan' },
    ] as s (s.key)}
      {@const active = (s.key === 1 && (step === 'input' || step === 'loading-q' && completedStep < 1))
        || (s.key === 2 && (step === 'round1' || step === 'loading-q' && completedStep === 1))
        || (s.key === 3 && (step === 'round2' || step === 'loading-q' && completedStep === 2))
        || (s.key === 4 && (step === 'round3' || step === 'loading-q' && completedStep === 3))
        || (s.key === 5 && (step === 'loading-strategy' || step === 'strategy'))}
      {@const done = !active && s.key <= completedStep}
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
        What do you want to achieve?
      </label>
      <p class="mb-3 text-sm text-text-muted">
        Describe what you'd like AI to help you with. The more detail you give, the better your plan will be.
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
      {#if step === 'loading-q' && round1Questions.length === 0}
        <div class="mt-4">
          <ProgressBar
            estimatedMs={currentEstimateMs}
            done={loadingDone}
            label="Analyzing your goal..."
          />
        </div>
      {/if}
    </div>
  {/if}

  <!-- Loading questions (between rounds) -->
  {#if step === 'loading-q' && round1Questions.length > 0}
    <ProgressBar
      estimatedMs={currentEstimateMs}
      done={loadingDone}
      label="Preparing your next questions..."
    />
  {/if}

  <!-- ROUND 1/2/3: Question Selection -->
  {#if step === 'round1' || step === 'round2' || step === 'round3'}
    {@const roundNum = step === 'round1' ? 1 : step === 'round2' ? 2 : 3}
    {@const questions = step === 'round1' ? round1Questions : step === 'round2' ? round2Questions : round3Questions}
    {@const selections = step === 'round1' ? round1Selections : step === 'round2' ? round2Selections : round3Selections}
    {@const submitFn = step === 'round1' ? submitRound1 : step === 'round2' ? submitRound2 : submitRound3}
    {@const count = selectedCount(selections)}
    {@const roundDescriptions = {
      1: 'Check the ones that are true for you. Checked = yes.',
      2: 'Great, a few more based on your answers. Check what applies.',
      3: 'Almost done! Last round — check what applies.',
    }}

    <!-- Goal recap -->
    <div class="mb-4 rounded-lg bg-surface-dark p-3">
      <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-faint">Your Goal</div>
      <p class="text-sm text-text line-clamp-2">{goal}</p>
    </div>

    <div class="rounded-xl bg-surface p-6 shadow-sm ring-1 ring-border">
      <div class="mb-1 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-text">Quick Questions — Round {roundNum} of 3</h2>
        <span class="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          {count} selected
        </span>
      </div>
      <p class="mb-5 text-sm text-text-muted">{roundDescriptions[roundNum as 1 | 2 | 3]}</p>

      <div class="grid gap-3">
        {#each questions as q (q.id)}
          {@const selected = !!selections[q.id]}
          <button
            onclick={() => {
              if (step === 'round1') round1Selections = { ...round1Selections, [q.id]: !selected };
              else if (step === 'round2') round2Selections = { ...round2Selections, [q.id]: !selected };
              else round3Selections = { ...round3Selections, [q.id]: !selected };
            }}
            class="flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-all
              {selected
                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                : 'border-border hover:border-primary/50'}"
          >
            <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs
              {selected ? 'border-primary bg-primary text-white' : 'border-text-faint/30'}">
              {selected ? '✓' : ''}
            </span>
            <span class="text-sm font-bold {selected ? 'text-text' : 'text-text-muted'}">{q.question}</span>
          </button>
        {/each}
      </div>

      <!-- Round-level context -->
      <div class="mt-5">
        <label for="round-context" class="mb-1.5 block text-xs font-semibold text-text-faint">Anything else to add for this round? (optional)</label>
        <textarea
          id="round-context"
          placeholder="Extra context, clarifications, or details..."
          rows="2"
          value={step === 'round1' ? round1Context : step === 'round2' ? round2Context : round3Context}
          oninput={(e) => {
            const val = (e.target as HTMLTextAreaElement).value;
            if (step === 'round1') round1Context = val;
            else if (step === 'round2') round2Context = val;
            else round3Context = val;
          }}
          class="w-full resize-y rounded-lg border border-border bg-surface-dark px-3 py-2 text-sm text-text placeholder-text-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
        ></textarea>
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
          {roundNum < 3 ? 'Next Round →' : 'Get My Plan →'}
        </button>
      </div>
    </div>
  {/if}

  <!-- Loading strategy -->
  {#if step === 'loading-strategy'}
    <ProgressBar
      estimatedMs={currentEstimateMs}
      done={loadingDone}
      label="Building your personalized plan..."
      messages={funnyMessages}
    />
  {/if}

  <!-- STEP 5: Strategy Result -->
  {#if step === 'strategy' && strategy}
    <!-- Regenerate bar -->
    <div class="mb-6 flex gap-2">
      <input
        type="text"
        bind:value={feedback}
        placeholder="Want changes? Describe what to adjust and regenerate..."
        onkeydown={(e) => { if (e.key === 'Enter') regenerateStrategy(); }}
        class="flex-1 rounded-lg border border-border bg-surface-dark px-4 py-2.5 text-sm text-text placeholder-text-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
      />
      <button
        onclick={regenerateStrategy}
        disabled={!feedback.trim()}
        class="shrink-0 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Regenerate
      </button>
    </div>

    <!-- Strategy Header -->
    <div class="mb-6 rounded-xl bg-gradient-to-r from-primary/10 to-success/10 p-6 ring-1 ring-primary/20">
      <h2 class="text-2xl font-bold text-text">{strategy.title}</h2>
      <p class="mt-2 text-sm text-text-muted">{strategy.summary}</p>
      {#if strategy.startingState}
        <div class="mt-3 rounded-lg bg-surface/60 p-3">
          <span class="text-xs font-semibold uppercase text-text-faint">Starting point:</span>
          <p class="mt-0.5 text-sm text-text-muted">{strategy.startingState}</p>
        </div>
      {/if}
      <div class="mt-3 inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-medium text-text-muted ring-1 ring-border">
        🟢 Use ChatGPT
        <a href="https://chat.openai.com" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Open ChatGPT →</a>
      </div>
    </div>

    <!-- Steps with collapsible prompts -->
    <div class="mb-6 rounded-xl bg-surface p-6 ring-1 ring-border">
      <h3 class="mb-4 text-sm font-semibold uppercase tracking-wider text-text-faint">Your Step-by-Step Plan</h3>
      <div class="space-y-3">
        {#each strategy.steps as stepItem, i (stepItem.order)}
          <div class="rounded-lg border border-border transition-all {openStepIndex === i ? 'ring-1 ring-primary/30' : ''}">
            <button
              onclick={() => { openStepIndex = openStepIndex === i ? null : i; }}
              class="flex w-full items-start gap-3 p-4 text-left"
            >
              <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                {stepItem.order}
              </span>
              <div class="flex-1">
                <h4 class="font-semibold text-text">{stepItem.title}</h4>
                <p class="mt-0.5 text-sm text-text-muted">{stepItem.description}</p>
              </div>
              <span class="mt-1 shrink-0 text-xs text-text-faint transition-transform {openStepIndex === i ? 'rotate-180' : ''}">
                ▼
              </span>
            </button>
            {#if openStepIndex === i}
              <div class="border-t border-border bg-surface-dark p-4">
                <!-- Artifacts info -->
                {#if stepItem.inputArtifacts || stepItem.outputArtifacts}
                  <div class="mb-3 grid gap-2 sm:grid-cols-2">
                    {#if stepItem.inputArtifacts}
                      <div class="rounded-lg bg-surface/50 p-2.5">
                        <span class="text-[10px] font-semibold uppercase text-text-faint">📥 You have</span>
                        <p class="mt-0.5 text-xs text-text-muted">{stepItem.inputArtifacts}</p>
                      </div>
                    {/if}
                    {#if stepItem.outputArtifacts}
                      <div class="rounded-lg bg-success/5 p-2.5">
                        <span class="text-[10px] font-semibold uppercase text-success/80">📤 You'll get</span>
                        <p class="mt-0.5 text-xs text-text-muted">{stepItem.outputArtifacts}</p>
                      </div>
                    {/if}
                  </div>
                {/if}
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-xs font-semibold text-text-faint">📋 Copy and paste this into ChatGPT:</span>
                  <button
                    onclick={() => copyStepPrompt(i, stepItem.prompt)}
                    class="rounded bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    {copiedStepIndex === i ? '✓ Copied!' : 'Copy'}
                  </button>
                </div>
                <div class="whitespace-pre-line rounded-lg bg-surface p-3 text-sm text-text ring-1 ring-border">
                  {stepItem.prompt}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- End Result & Next Steps -->
    {#if strategy.endResult || strategy.nextSteps}
      <div class="mb-6 rounded-xl bg-gradient-to-r from-success/5 to-primary/5 p-6 ring-1 ring-success/20">
        {#if strategy.endResult}
          <div class="mb-3">
            <h3 class="text-sm font-semibold text-success">🎯 What you'll have at the end</h3>
            <p class="mt-1 text-sm text-text-muted">{strategy.endResult}</p>
          </div>
        {/if}
        {#if strategy.nextSteps}
          <div>
            <h3 class="text-sm font-semibold text-primary">🚀 Suggested next steps</h3>
            <p class="mt-1 text-sm text-text-muted">{strategy.nextSteps}</p>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Spec Summary -->
    <details class="mb-6 rounded-xl bg-surface p-6 ring-1 ring-border">
      <summary class="cursor-pointer text-sm font-semibold text-text-faint hover:text-text">
        View your answers ({getAllAnswers().length} questions)
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
