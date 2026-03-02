import { z } from "zod";
import { RUN_PURPOSES } from "../constants/run-states.js";

export const createRunRequestSchema = z.object({
	purpose: z.enum(RUN_PURPOSES),
	inputs: z.object({
		prompt: z.string().optional(),
		promptHash: z.string().min(1),
		context: z.record(z.unknown()).optional(),
		sourceDocIds: z.array(z.string()).optional(),
	}),
	budget: z
		.object({
			maxTokens: z.number().positive(),
			maxDurationMs: z.number().positive(),
			estimatedCostUsd: z.number().nonnegative(),
		})
		.optional(),
});

export const cancelRunRequestSchema = z.object({
	reason: z.string().max(500).optional(),
});

export type CreateRunRequestInput = z.infer<typeof createRunRequestSchema>;
export type CancelRunRequestInput = z.infer<typeof cancelRunRequestSchema>;
