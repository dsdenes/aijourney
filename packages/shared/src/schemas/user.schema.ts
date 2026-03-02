import { z } from "zod";
import { COMFORT_LEVELS } from "../constants/journey-levels.js";
import { ROLES } from "../constants/roles.js";

export const userPreferencesSchema = z.object({
	tools: z.array(z.string()).optional(),
	workflows: z.array(z.string()).optional(),
	comfortLevel: z.enum(COMFORT_LEVELS).optional(),
	goals: z.array(z.string()).optional(),
	completedPractices: z.array(z.number().int().min(1).max(25)).optional(),
});

export const createUserSchema = z.object({
	googleId: z.string().min(1),
	email: z
		.string()
		.email()
		.endsWith("@mito.hu", { message: "Email must be @mito.hu" }),
	name: z.string().min(1).max(200),
	avatarUrl: z.string().url().optional(),
	role: z.enum(ROLES).default("employee"),
});

export const updateUserSchema = z.object({
	name: z.string().min(1).max(200).optional(),
	department: z.string().max(100).optional(),
	jobTitle: z.string().max(200).optional(),
	jobDescription: z.string().max(5000).optional(),
	preferences: userPreferencesSchema.optional(),
	onboardingComplete: z.boolean().optional(),
	role: z.enum(ROLES).optional(),
	lastLoginAt: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
