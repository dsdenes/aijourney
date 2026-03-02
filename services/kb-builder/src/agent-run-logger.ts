import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
	DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
	UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { generateId, nowISO } from "@aijourney/shared";
import type { AgentRun, AgentRunStatus, AgentType } from "@aijourney/shared";
import { log } from "./log-stream.js";

const client = new DynamoDBClient({
	region: process.env.AWS_REGION || "eu-central-1",
	...(process.env.DYNAMODB_ENDPOINT && {
		endpoint: process.env.DYNAMODB_ENDPOINT,
	}),
});

const ddb = DynamoDBDocumentClient.from(client, {
	marshallOptions: { removeUndefinedValues: true },
});

const TABLE = "agent_runs";

/**
 * Start a new agent run and persist it to DynamoDB.
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
		await ddb.send(new PutCommand({ TableName: TABLE, Item: run }));
		log("debug", `Agent run started: ${run.id} [${run.agent}]`, {
			runId: run.id,
		});
	} catch (err) {
		log("warn", `Failed to log agent run start: ${err instanceof Error ? err.message : String(err)}`);
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
		const existing = await ddb.send(
			new GetCommand({ TableName: TABLE, Key: { id } }),
		);
		const existingMeta = (existing.Item?.metadata as Record<string, unknown>) || {};
		const mergedMetadata = { ...existingMeta, ...(result.metadata || {}) };

		const updateParts = [
			"#s = :status",
			"#out = :output",
			"tokensUsed = :tokens",
			"promptTokens = :ptokens",
			"completionTokens = :ctokens",
			"durationMs = :dur",
			"completedAt = :comp",
			"metadata = :meta",
		];
		const exprNames: Record<string, string> = {
			"#s": "status",
			"#out": "output",
		};
		const exprValues: Record<string, unknown> = {
			":status": "completed" as AgentRunStatus,
			":output": result.output,
			":tokens": result.tokensUsed ?? 0,
			":ptokens": result.promptTokens ?? 0,
			":ctokens": result.completionTokens ?? 0,
			":dur": result.durationMs ?? 0,
			":comp": nowISO(),
			":meta": mergedMetadata,
		};

		if (result.fullOutput !== undefined) {
			updateParts.push("fullOutput = :fout");
			exprValues[":fout"] = result.fullOutput;
		}

		await ddb.send(
			new UpdateCommand({
				TableName: TABLE,
				Key: { id },
				UpdateExpression: "SET " + updateParts.join(", "),
				ExpressionAttributeNames: exprNames,
				ExpressionAttributeValues: exprValues,
			}),
		);
		log("debug", `Agent run completed: ${id} (${result.tokensUsed ?? 0} tokens [${result.promptTokens ?? 0} in / ${result.completionTokens ?? 0} out])`, {
			runId: id,
		});
	} catch (err) {
		log("warn", `Failed to log agent run completion: ${err instanceof Error ? err.message : String(err)}`);
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
		await ddb.send(
			new UpdateCommand({
				TableName: TABLE,
				Key: { id },
				UpdateExpression:
					"SET #s = :status, #err = :error, durationMs = :dur, completedAt = :comp",
				ExpressionAttributeNames: {
					"#s": "status",
					"#err": "error",
				},
				ExpressionAttributeValues: {
					":status": "failed" as AgentRunStatus,
					":error": error,
					":dur": durationMs ?? 0,
					":comp": nowISO(),
				},
			}),
		);
		log("debug", `Agent run failed: ${id} — ${error}`, { runId: id });
	} catch (err) {
		log("warn", `Failed to log agent run failure: ${err instanceof Error ? err.message : String(err)}`);
	}
}
