import type {
	KpiCategory,
	MeasurementType,
} from "../constants/journey-levels.js";

export interface RubricLevel {
	score: number;
	label: string;
	description: string;
}

export interface KPI {
	id: string;
	name: string;
	description: string;
	category: KpiCategory;
	measurementType: MeasurementType;
	rubricLevels?: RubricLevel[];
	unit?: string;
	direction: "higher_is_better" | "lower_is_better" | "target";
	targetValue?: number;
	isGlobal: boolean;
	createdAt: string;
}
