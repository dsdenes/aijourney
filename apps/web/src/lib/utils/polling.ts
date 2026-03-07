interface PollingOptions {
  intervalMs: number;
  runImmediately?: boolean;
  visibleOnly?: boolean;
}

export function startPolling(
  task: () => void | Promise<void>,
  { intervalMs, runImmediately = true, visibleOnly = true }: PollingOptions,
): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let running = false;

  const shouldRun = () =>
    !visibleOnly || typeof document === 'undefined' || document.visibilityState === 'visible';

  const clearScheduledRun = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const scheduleNextRun = () => {
    if (stopped) {
      return;
    }

    clearScheduledRun();
    timeoutId = setTimeout(() => {
      void runTask();
    }, intervalMs);
  };

  const runTask = async () => {
    if (stopped) {
      return;
    }

    if (!shouldRun() || running) {
      scheduleNextRun();
      return;
    }

    running = true;
    try {
      await task();
    } finally {
      running = false;
      scheduleNextRun();
    }
  };

  const handleVisibilityChange = () => {
    if (stopped || !visibleOnly || typeof document === 'undefined') {
      return;
    }

    if (document.visibilityState !== 'visible') {
      return;
    }

    clearScheduledRun();
    if (!running) {
      void runTask();
    }
  };

  if (visibleOnly && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  if (runImmediately) {
    void runTask();
  } else {
    scheduleNextRun();
  }

  return () => {
    stopped = true;
    clearScheduledRun();
    if (visibleOnly && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
}
