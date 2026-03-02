import type {
	EvidenceType,
	ReviewStatus,
} from "../constants/journey-levels.js";

export interface EvidenceContent {
	s3Key?: string;
	url?: string;
	text?: string;
	metricValue?: number;
	metricUnit?: string;
}

export interface KpiMeasurement {
	kpiId: string;
	value: number | string;
	measuredAt: string;
	source: "self_report" | "peer_review" | "auto";
}

export interface Evidence {
	id: string;
	stepId: string;
	userId: string;
	type: EvidenceType;
	content: EvidenceContent;
	kpiMeasurements: KpiMeasurement[];
	reviewStatus: ReviewStatus;
	reviewNotes?: string;
	reviewedBy?: string;
	submittedAt: string;
	reviewedAt?: string;
}
