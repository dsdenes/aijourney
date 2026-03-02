import type { RunLogEvent } from "../constants/run-states.js";

export interface RunLogActor {
	userId?: string;
	system?: string;
}

export interface RunLog {
	runRequestId: string;
	timestamp: string;
	event: RunLogEvent;
	actor: RunLogActor;
	details: Record<string, unknown>;
	tokensUsedSoFar?: number;
	costSoFar?: number;
}
