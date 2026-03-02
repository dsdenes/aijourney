import type { AgentRun, AgentRunStatus, AgentType } from "@aijourney/shared";
import { generateId, nowISO } from "@aijourney/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { AgentRunsRepository } from "./agent-runs.repository";

@Injectable()
export class AgentRunsService {
	private readonly logger = new Logger(AgentRunsService.name);

	constructor(
		@Inject(AgentRunsRepository)
		private readonly repo: AgentRunsRepository,
	) {}

	/**
	 * Start a new agent run. Returns the run so it can be updated later.
	 */
	async startRun(params: {
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

		await this.repo.create(run);
		this.logger.debug(`Agent run started: ${run.id} [${run.agent}]`);
		return run;
	}

	/**
	 * Complete a run with success.
	 */
	async completeRun(
		id: string,
		result: {
			output: string;
			fullInput?: string;
			fullOutput?: string;
			tokensUsed?: number;
			promptTokens?: number;
			completionTokens?: number;
			durationMs?: number;
			metadata?: Record<string, unknown>;
		},
	): Promise<void> {
		const now = nowISO();
		const existing = await this.repo.getById(id);
		const mergedMetadata = {
			...(existing?.metadata || {}),
			...(result.metadata || {}),
		};

		const updatePayload: Record<string, unknown> = {
			status: "completed" as AgentRunStatus,
			output: result.output,
			tokensUsed: result.tokensUsed,
			promptTokens: result.promptTokens,
			completionTokens: result.completionTokens,
			durationMs: result.durationMs,
			completedAt: now,
			metadata: mergedMetadata,
		};

		if (result.fullInput !== undefined) {
			updatePayload.fullInput = result.fullInput;
		}
		if (result.fullOutput !== undefined) {
			updatePayload.fullOutput = result.fullOutput;
		}

		await this.repo.update(id, updatePayload);
		this.logger.debug(
			`Agent run completed: ${id} (${result.tokensUsed ?? 0} tokens [${result.promptTokens ?? 0} in / ${result.completionTokens ?? 0} out], ${result.durationMs ?? 0}ms)`,
		);
	}

	/**
	 * Mark a run as failed.
	 */
	async failRun(
		id: string,
		error: string,
		durationMs?: number,
	): Promise<void> {
		await this.repo.update(id, {
			status: "failed" as AgentRunStatus,
			error,
			durationMs,
			completedAt: nowISO(),
		});
		this.logger.debug(`Agent run failed: ${id} — ${error}`);
	}

	/**
	 * List all agent runs, sorted newest first.
	 */
	async listAll(): Promise<AgentRun[]> {
		const runs = await this.repo.listAll(500);
		return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	/**
	 * List runs for a specific agent type.
	 */
	async listByAgent(agent: string): Promise<AgentRun[]> {
		return this.repo.listByAgent(agent);
	}

	/**
	 * Get a specific run by ID.
	 */
	async getById(id: string): Promise<AgentRun | undefined> {
		return this.repo.getById(id);
	}
}
