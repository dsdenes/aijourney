/**
 * localStorage-backed store for tracking the last N elapsed times per operation.
 * Used to estimate progress bar duration based on historical averages.
 */

const STORAGE_KEY = "aijourney:elapsed-times";
const MAX_ENTRIES = 10;

export type TimingKey =
	| "planner:questions"
	| "planner:strategy"
	| "optimizer:analyze"
	| "optimizer:optimize";

interface TimingStore {
	[key: string]: number[];
}

function load(): TimingStore {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as TimingStore) : {};
	} catch {
		return {};
	}
}

function save(store: TimingStore): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
	} catch {
		// localStorage full or unavailable — silently fail
	}
}

/**
 * Record an elapsed time (ms) for a given operation key.
 * Keeps only the last MAX_ENTRIES entries.
 */
export function addElapsedTime(key: TimingKey, ms: number): void {
	const store = load();
	const list = store[key] ?? [];
	list.push(Math.round(ms));
	if (list.length > MAX_ENTRIES) {
		list.splice(0, list.length - MAX_ENTRIES);
	}
	store[key] = list;
	save(store);
}

/**
 * Get the average elapsed time (ms) for a given operation key.
 * Returns the provided fallback if no history exists.
 */
export function getAverageTime(
	key: TimingKey,
	fallbackMs: number = 15000,
): number {
	const store = load();
	const list = store[key];
	if (!list || list.length === 0) return fallbackMs;
	const sum = list.reduce((a, b) => a + b, 0);
	return Math.round(sum / list.length);
}
