import { z } from 'zod';
import { JOURNEY_STATUSES } from '../constants/journey-levels.js';
import { JOURNEY_LEVELS } from '../constants/roles.js';

export const createJourneySchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).max(500),
  description: z.string().max(5000),
  currentLevel: z.enum(JOURNEY_LEVELS).default('L0'),
  competencyAreas: z.array(z.string()).min(1),
  metadata: z.object({
    estimatedDurationWeeks: z.number().positive(),
    difficultyProgression: z.string(),
    roleCategory: z.string(),
  }),
});

export const updateJourneySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(JOURNEY_STATUSES).optional(),
  currentLevel: z.enum(JOURNEY_LEVELS).optional(),
});

export type CreateJourneyInput = z.infer<typeof createJourneySchema>;
export type UpdateJourneyInput = z.infer<typeof updateJourneySchema>;
