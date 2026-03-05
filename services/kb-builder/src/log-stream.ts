import type { Response } from 'express';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: Record<string, unknown>;
}

/** Maximum entries kept in memory for late-joiners */
const MAX_BUFFER = 500;

const buffer: LogEntry[] = [];
const clients = new Set<Response>();

function emit(entry: LogEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();

  const payload = `data: ${JSON.stringify(entry)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

export function log(
  level: LogEntry['level'],
  message: string,
  data?: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
  };
  emit(entry);

  // Also log to stdout for debugging
  const prefix = `[kb-builder][${level}]`;
  if (level === 'error') {
    console.error(prefix, message, data ?? '');
  } else {
    console.log(prefix, message, data ?? '');
  }
}

export function getLogBuffer(): LogEntry[] {
  return [...buffer];
}

export function clearLogBuffer(): void {
  buffer.length = 0;
}

/** Register an SSE client. Sends all buffered entries, then streams live. */
export function addSSEClient(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send all buffered entries first
  for (const entry of buffer) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  clients.add(res);

  res.on('close', () => {
    clients.delete(res);
  });
}
