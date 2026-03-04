/** @deprecated Use GLOBAL_ROLES + ORG_ROLES instead */
export const ROLES = ["employee", "admin"] as const;
/** @deprecated Use GlobalRole + OrgRole instead */
export type Role = (typeof ROLES)[number];

export const GLOBAL_ROLES = ["superadmin", "user"] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

export const ORG_ROLES = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const JOURNEY_LEVELS = ["L0", "L1", "L2", "L3", "L4"] as const;
export type JourneyLevel = (typeof JOURNEY_LEVELS)[number];

export const JOURNEY_LEVEL_NAMES: Record<JourneyLevel, string> = {
	L0: "Awareness",
	L1: "Exploration",
	L2: "Integration",
	L3: "Optimization",
	L4: "Innovation",
};
