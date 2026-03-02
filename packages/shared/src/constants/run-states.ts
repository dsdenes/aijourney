export const RUN_STATUSES = [
	"PENDING",
	"APPROVED",
	"RUNNING",
	"COMPLETED",
	"FAILED",
	"CANCEL_REQUESTED",
	"CANCELLED",
	"REJECTED",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_PURPOSES = [
	"summarization",
	"personalization",
	"kb_chat",
	"kb_ingestion",
] as const;

export type RunPurpose = (typeof RUN_PURPOSES)[number];

/** Valid state transitions for RunRequest state machine */
export const RUN_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
	PENDING: ["APPROVED", "REJECTED"],
	APPROVED: ["RUNNING", "CANCELLED"],
	RUNNING: ["COMPLETED", "FAILED", "CANCEL_REQUESTED"],
	CANCEL_REQUESTED: ["CANCELLED", "COMPLETED", "FAILED"],
	COMPLETED: [],
	FAILED: [],
	CANCELLED: [],
	REJECTED: [],
};

export const RUN_LOG_EVENTS = [
	"created",
	"approved",
	"rejected",
	"started",
	"progress",
	"cancel_requested",
	"cancelled",
	"completed",
	"failed",
	"budget_warning",
	"budget_exceeded",
] as const;

export type RunLogEvent = (typeof RUN_LOG_EVENTS)[number];

/** Default budgets per purpose */
export const DEFAULT_BUDGETS: Record<
	RunPurpose,
	{ maxTokens: number; maxDurationMs: number; estimatedCostUsd: number }
> = {
	summarization: {
		maxTokens: 8000,
		maxDurationMs: 60_000,
		estimatedCostUsd: 0.05,
	},
	personalization: {
		maxTokens: 16_000,
		maxDurationMs: 120_000,
		estimatedCostUsd: 0.15,
	},
	kb_chat: { maxTokens: 4000, maxDurationMs: 30_000, estimatedCostUsd: 0.02 },
	kb_ingestion: {
		maxTokens: 100_000,
		maxDurationMs: 600_000,
		estimatedCostUsd: 1.0,
	},
};
