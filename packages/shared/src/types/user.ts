import type { ComfortLevel } from "../constants/journey-levels.js";
import type { Role } from "../constants/roles.js";

export interface UserPreferences {
	tools?: string[];
	workflows?: string[];
	comfortLevel?: ComfortLevel;
	goals?: string[];
}

export interface User {
	id: string;
	googleId: string;
	email: string;
	name: string;
	avatarUrl?: string;
	role: Role;
	department?: string;
	jobTitle?: string;
	jobDescription?: string;
	onboardingComplete: boolean;
	preferences: UserPreferences;
	createdAt: string;
	updatedAt: string;
	lastLoginAt: string;
}
