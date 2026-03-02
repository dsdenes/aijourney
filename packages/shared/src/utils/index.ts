import { ulid } from "ulid";

export type { RateLimiterConfig } from "./rate-limiter.js";
export { getRateLimiter, RateLimiter } from "./rate-limiter.js";

/** Generate a ULID (time-sortable unique ID) */
export function generateId(): string {
	return ulid();
}

/** Get current ISO 8601 timestamp */
export function nowISO(): string {
	return new Date().toISOString();
}

/** Validate that a state transition is allowed */
export function isValidTransition(
	transitions: Record<string, readonly string[]>,
	from: string,
	to: string,
): boolean {
	const allowed = transitions[from];
	if (!allowed) return false;
	return allowed.includes(to);
}

/** Total number of prompting practices in the system */
export const TOTAL_PRACTICES = 25;

/**
 * Compute the AI comfort level based on how many prompting practices
 * the user has completed.
 *
 * - 0–8   → beginner
 * - 9–16  → intermediate
 * - 17–25 → advanced
 */
export function comfortLevelFromPractices(
	completedCount: number,
): "beginner" | "intermediate" | "advanced" {
	if (completedCount >= 17) return "advanced";
	if (completedCount >= 9) return "intermediate";
	return "beginner";
}
