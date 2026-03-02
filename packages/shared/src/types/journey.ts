import type { JourneyStatus } from "../constants/journey-levels.js";
import type { JourneyLevel } from "../constants/roles.js";

export interface JourneyGeneratedBy {
	runRequestId: string;
	model: string;
	promptVersion: string;
}

export interface JourneyMetadata {
	estimatedDurationWeeks: number;
	difficultyProgression: string;
	roleCategory: string;
}

export interface Journey {
	id: string;
	userId: string;
	version: number;
	title: string;
	description: string;
	status: JourneyStatus;
	currentLevel: JourneyLevel;
	competencyAreas: string[];
	generatedBy: JourneyGeneratedBy;
	metadata: JourneyMetadata;
	createdAt: string;
	updatedAt: string;
}
