import { z } from "zod";
import { TENANT_PLANS } from "../types/tenant.js";

export const createTenantSchema = z.object({
	name: z.string().min(1).max(200),
	slug: z
		.string()
		.min(2)
		.max(50)
		.regex(/^[a-z0-9-]+$/, {
			message: "Slug must be lowercase alphanumeric with hyphens",
		}),
	plan: z.enum(TENANT_PLANS).default("free"),
});

export const updateTenantSchema = z.object({
	name: z.string().min(1).max(200).optional(),
	settings: z
		.object({
			displayName: z.string().max(200).optional(),
			logoUrl: z.string().url().optional(),
		})
		.optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
