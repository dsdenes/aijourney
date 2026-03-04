/** A single extracted fact from a user interaction */
export interface MemoryFact {
	id: string;
	userId: string;
	/** The fact text, e.g. "Works in marketing department" */
	fact: string;
	/** Category for grouping: preferences, goals, skills, context, personality */
	category: MemoryCategory;
	/** Which feature produced this fact */
	source: MemorySource;
	/** Original user input that the fact was extracted from (truncated) */
	sourceExcerpt: string;
	createdAt: string;
	/** If a newer fact supersedes this one */
	supersededBy?: string;
}

export type MemoryCategory =
	| "preferences"
	| "goals"
	| "skills"
	| "context"
	| "personality";

export type MemorySource =
	| "ai-planner"
	| "ai-chat"
	| "prompt-optimizer";

/** A memory extraction job payload */
export interface MemoryExtractionJob {
	userId: string;
	source: MemorySource;
	/** The user's raw input text to extract facts from */
	userInput: string;
	/** Optional existing facts for deduplication */
	existingFactIds?: string[];
}

/** Stats about the memory extraction queue */
export interface MemoryQueueStats {
	waiting: number;
	active: number;
	completed: number;
	failed: number;
	delayed: number;
}

/** Stats for the admin monitor page */
export interface MemoryStats {
	totalFacts: number;
	factsByCategory: Record<MemoryCategory, number>;
	factsBySource: Record<MemorySource, number>;
	queueStats: MemoryQueueStats;
	recentExtractions: MemoryExtraction[];
}

/** A completed extraction event for monitoring */
export interface MemoryExtraction {
	id: string;
	userId: string;
	source: MemorySource;
	factsExtracted: number;
	inputLength: number;
	processedAt: string;
	durationMs: number;
	status: "completed" | "failed";
	error?: string;
}
