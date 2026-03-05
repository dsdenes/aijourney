export const JOURNEY_STATUSES = ['draft', 'active', 'completed', 'archived'] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

export const STEP_STATUSES = [
  'locked',
  'available',
  'in_progress',
  'submitted',
  'reviewed',
  'completed',
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const EVIDENCE_TYPES = ['file', 'screenshot', 'url', 'text', 'metric'] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const REVIEW_METHODS = ['self', 'peer', 'manager', 'auto'] as const;
export type ReviewMethod = (typeof REVIEW_METHODS)[number];

export const REVIEW_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const COMFORT_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type ComfortLevel = (typeof COMFORT_LEVELS)[number];

export const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export const ARTICLE_STATUSES = [
  'fetched',
  'extracted',
  'deduped',
  'quality_passed',
  'quality_failed',
  'summarized',
  'ingested',
  'rejected',
] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const KPI_CATEGORIES = ['step_outcome', 'journey_progress', 'org_level'] as const;
export type KpiCategory = (typeof KPI_CATEGORIES)[number];

export const MEASUREMENT_TYPES = ['numeric', 'percentage', 'boolean', 'rubric'] as const;
export type MeasurementType = (typeof MEASUREMENT_TYPES)[number];
