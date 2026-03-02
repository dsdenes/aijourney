import { ulid } from "ulid";

export { RateLimiter, getRateLimiter } from "./rate-limiter.js";
export type { RateLimiterConfig } from "./rate-limiter.js";

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
