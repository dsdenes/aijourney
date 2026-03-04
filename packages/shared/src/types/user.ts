import type { ComfortLevel } from "../constants/journey-levels.js";
import type { GlobalRole, OrgRole, Role } from "../constants/roles.js";

export interface UserPreferences {
	tools?: string[];
	workflows?: string[];
	comfortLevel?: ComfortLevel;
	goals?: string[];
	completedPractices?: number[];
}

export interface User {
	id: string;
	googleId: string;
	email: string;
	name: string;
	avatarUrl?: string;
	/** @deprecated Use globalRole instead */
	role: Role;
	/** System-wide role: superadmin | user */
	globalRole: GlobalRole;
	/** Tenant this user belongs to */
	tenantId: string;
	/** Role within the tenant: owner | admin | member */
	orgRole: OrgRole;
	department?: string;
	jobTitle?: string;
	jobDescription?: string;
	onboardingComplete: boolean;
	preferences: UserPreferences;
	createdAt: string;
	updatedAt: string;
	lastLoginAt: string;
}
