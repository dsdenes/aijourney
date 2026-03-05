export const AGENT_TYPES = [
  'chat',
  'summarizer',
  'rag-ingestor',
  'crawler',
  'quality-filter',
  'pipeline',
  'article-rec-fetch',
  'article-rec-select',
] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export const AGENT_RUN_STATUSES = ['running', 'completed', 'failed'] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export interface AgentRun {
  id: string;
  agent: AgentType;
  status: AgentRunStatus;
  /** Short summary of the input (truncated query, article title, etc.) */
  input: string;
  /** Short summary of the output (truncated answer, summary count, etc.) */
  output?: string;
  /** Complete input sent to the LLM (JSON-stringified messages array) */
  fullInput?: string;
  /** Complete output received from the LLM (raw response content) */
  fullOutput?: string;
  /** LLM model used, if applicable */
  model?: string;
  /** Total tokens consumed */
  tokensUsed?: number;
  /** Input/prompt tokens */
  promptTokens?: number;
  /** Output/completion tokens */
  completionTokens?: number;
  /** Wall-clock duration in milliseconds */
  durationMs?: number;
  /** Error message if status is 'failed' */
  error?: string;
  /** Extra details (sources count, article IDs, chunk counts, etc.) */
  metadata?: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
}
