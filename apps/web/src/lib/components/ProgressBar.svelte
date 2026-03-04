<script lang="ts">
  /**
   * Animated progress bar that fills based on an estimated duration.
   * It accelerates to ~90% over the average time, then slows asymptotically
   * so it never quite hits 100% until `done` is set to true.
   */
  interface Props {
    /** Estimated total duration in ms (from historical average) */
    estimatedMs: number;
    /** Set to true when the operation completes — instantly jumps to 100% */
    done?: boolean;
    /** Optional label shown above the bar */
    label?: string;
    /** Optional array of rotating messages */
    messages?: string[];
    /** Interval between message rotations (ms, default 2500) */
    messageIntervalMs?: number;
  }

  let { estimatedMs, done = false, label = '', messages = [], messageIntervalMs = 2500 }: Props = $props();

  let progress = $state(0);
  let startTime = $state(Date.now());
  let messageIndex = $state(0);
  let animFrame = $state<number | null>(null);
  let msgInterval = $state<ReturnType<typeof setInterval> | null>(null);

  function easeProgress(elapsed: number, estimated: number): number {
    // Fast ramp to ~90% over the estimated time, then asymptotic approach to 98%
    const ratio = elapsed / estimated;
    if (ratio <= 1) {
      // ease-out curve: fast start, slowing toward 90%
      return 90 * (1 - Math.pow(1 - ratio, 2.5));
    }
    // Beyond estimated time: slowly approach 98%
    const overshoot = (elapsed - estimated) / estimated;
    return 90 + 8 * (1 - Math.exp(-overshoot * 1.5));
  }

  function tick() {
    if (done) {
      progress = 100;
      return;
    }
    const elapsed = Date.now() - startTime;
    progress = easeProgress(elapsed, estimatedMs);
    animFrame = requestAnimationFrame(tick);
  }

  $effect(() => {
    // Reset on mount / when estimatedMs changes
    startTime = Date.now();
    progress = 0;
    messageIndex = Math.floor(Math.random() * Math.max(messages.length, 1));

    if (!done) {
      animFrame = requestAnimationFrame(tick);
    }

    if (messages.length > 1) {
      msgInterval = setInterval(() => {
        messageIndex = (messageIndex + 1) % messages.length;
      }, messageIntervalMs);
    }

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
      if (msgInterval) clearInterval(msgInterval);
    };
  });

  // Jump to 100% when done becomes true
  $effect(() => {
    if (done) {
      progress = 100;
      if (animFrame) {
        cancelAnimationFrame(animFrame);
        animFrame = null;
      }
    }
  });

  // Compute remaining time estimate
  let remainingText = $derived.by(() => {
    if (done || progress >= 98) return '';
    const elapsed = Date.now() - startTime;
    if (progress <= 0) return '';
    const totalEstimate = (elapsed / progress) * 100;
    const remaining = Math.max(0, totalEstimate - elapsed);
    const secs = Math.ceil(remaining / 1000);
    if (secs <= 1) return 'almost done...';
    if (secs < 60) return `~${secs}s remaining`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `~${mins}m ${remSecs}s remaining`;
  });
</script>

<div class="flex flex-col items-center gap-3 py-8">
  {#if label}
    <p class="text-sm font-medium text-text">{label}</p>
  {/if}

  <!-- Progress bar -->
  <div class="w-full max-w-md">
    <div class="h-2 w-full overflow-hidden rounded-full bg-surface-darker">
      <div
        class="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
        style="width: {Math.min(progress, 100).toFixed(1)}%"
      ></div>
    </div>
    <div class="mt-1.5 flex items-center justify-between">
      <span class="text-xs font-medium text-primary">{Math.round(Math.min(progress, 100))}%</span>
      {#if remainingText}
        <span class="text-xs text-text-faint">{remainingText}</span>
      {/if}
    </div>
  </div>

  <!-- Rotating message -->
  {#if messages.length > 0}
    <p class="text-sm font-medium text-text-muted transition-opacity duration-300">
      {messages[messageIndex]}
    </p>
  {/if}
</div>
