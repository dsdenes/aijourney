import type { AgentRun, AgentRunStatus, AgentType } from "@aijourney/shared";
import { generateId, nowISO } from "@aijourney/shared";
import { getDb } from "./db.js";
import { log } from "./log-stream.js";

interface AgentRunDoc {
	_id: string;
	[key: string]: unknown;
}

function col() {
	return getDb().collection<AgentRunDoc>("agent_runs");
}

/**
 * Start a new agent run and persist it to MongoDB.
 * Returns the run record for later updates.
 */
export async function startAgentRun(params: {
	agent: AgentType;
	input: string;
	model?: string;
	fullInput?: string;
	metadata?: Record<string, unknown>;
}): Promise<AgentRun> {
	const run: AgentRun = {
		id: generateId(),
		agent: params.agent,
		status: "running",
		input: params.input,
		fullInput: params.fullInput,
		model: params.model,
		metadata: params.metadata,
		createdAt: nowISO(),
	};

	try {
		const { id, ...rest } = run;
		await col().insertOne({ _id: id, ...rest } as AgentRunDoc);
		log("debug", `Agent run started: ${run.id} [${run.agent}]`, {
			runId: run.id,
		});
	} catch (err) {
		log(
			"warn",
			`Failed to log agent run start: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	return run;
}

/**
 * Mark an agent run as completed.
 */
export async function completeAgentRun(
	id: string,
	result: {
		output: string;
		fullOutput?: string;
		tokensUsed?: number;
		promptTokens?: number;
		completionTokens?: number;
		durationMs?: number;
		metadata?: Record<string, unknown>;
	},
): Promise<void> {
	try {
		// Fetch existing to merge metadata
		const existing = await col().findOne({ _id: id });
		const existingMeta = (existing?.metadata as Record<string, unknown>) || {};
		const mergedMetadata = { ...existingMeta, ...(result.metadata || {}) };

		const updates: Record<string, unknown> = {
			status: "completed" as AgentRunStatus,
			output: result.output,
			tokensUsed: result.tokensUsed ?? 0,
			promptTokens: result.promptTokens ?? 0,
			completionTokens: result.completionTokens ?? 0,
			durationMs: result.durationMs ?? 0,
			completedAt: nowISO(),
			metadata: mergedMetadata,
		};

		if (result.fullOutput !== undefined) {
			updates.fullOutput = result.fullOutput;
		}

		await col().updateOne({ _id: id }, { $set: updates });
		log(
			"debug",
			`Agent run completed: ${id} (${result.tokensUsed ?? 0} tokens [${result.promptTokens ?? 0} in / ${result.completionTokens ?? 0} out])`,
			{ runId: id },
		);
	} catch (err) {
		log(
			"warn",
			`Failed to log agent run completion: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * Mark an agent run as failed.
 */
export async function failAgentRun(
	id: string,
	error: string,
	durationMs?: number,
): Promise<void> {
	try {
		await col().updateOne(
			{ _id: id },
			{
				$set: {
					status: "failed" as AgentRunStatus,
					error,
					durationMs: durationMs ?? 0,
					completedAt: nowISO(),
				},
			},
		);
		log("debug", `Agent run failed: ${id} — ${error}`, { runId: id });
	} catch (err) {
		log(
			"warn",
			`Failed to log agent run failure: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}
