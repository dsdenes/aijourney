export const ROLES = ["employee", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const JOURNEY_LEVELS = ["L0", "L1", "L2", "L3", "L4"] as const;
export type JourneyLevel = (typeof JOURNEY_LEVELS)[number];

export const JOURNEY_LEVEL_NAMES: Record<JourneyLevel, string> = {
	L0: "Awareness",
	L1: "Exploration",
	L2: "Integration",
	L3: "Optimization",
	L4: "Innovation",
};
