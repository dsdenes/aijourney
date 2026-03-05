import type { EvidenceType, ReviewMethod, StepStatus } from '../constants/journey-levels.js';
import type { JourneyLevel } from '../constants/roles.js';

export interface KpiTarget {
  kpiId: string;
  targetValue: number | string;
  targetUnit: string;
}

export interface Step {
  id: string;
  journeyId: string;
  level: JourneyLevel;
  order: number;
  title: string;
  description: string;
  task: string;
  expectedOutput: string;
  evidenceType: EvidenceType;
  kpiTargets: KpiTarget[];
  reviewMethod: ReviewMethod;
  tags: string[];
  toolsRequired?: string[];
  estimatedMinutes?: number;
  status: StepStatus;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
