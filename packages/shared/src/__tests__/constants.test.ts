import { describe, expect, it } from 'vitest';
import {
  ARTICLE_STATUSES,
  COMFORT_LEVELS,
  DEFAULT_BUDGETS,
  EVIDENCE_TYPES,
  JOURNEY_LEVEL_NAMES,
  JOURNEY_LEVELS,
  JOURNEY_STATUSES,
  KPI_CATEGORIES,
  MEASUREMENT_TYPES,
  ROLES,
  RUN_LOG_EVENTS,
  RUN_PURPOSES,
  RUN_STATUSES,
  RUN_TRANSITIONS,
  STEP_STATUSES,
} from '../index.js';

describe('Roles constants', () => {
  it('should have employee and admin roles', () => {
    expect(ROLES).toContain('employee');
    expect(ROLES).toContain('admin');
    expect(ROLES).toHaveLength(2);
  });
});

describe('Journey levels', () => {
  it('should have 5 levels L0-L4', () => {
    expect(JOURNEY_LEVELS).toEqual(['L0', 'L1', 'L2', 'L3', 'L4']);
  });

  it('should have human-readable names for all levels', () => {
    for (const level of JOURNEY_LEVELS) {
      expect(JOURNEY_LEVEL_NAMES[level]).toBeDefined();
      expect(typeof JOURNEY_LEVEL_NAMES[level]).toBe('string');
      expect(JOURNEY_LEVEL_NAMES[level].length).toBeGreaterThan(0);
    }
  });

  it('should have expected level names', () => {
    expect(JOURNEY_LEVEL_NAMES.L0).toBe('Awareness');
    expect(JOURNEY_LEVEL_NAMES.L1).toBe('Exploration');
    expect(JOURNEY_LEVEL_NAMES.L2).toBe('Integration');
    expect(JOURNEY_LEVEL_NAMES.L3).toBe('Optimization');
    expect(JOURNEY_LEVEL_NAMES.L4).toBe('Innovation');
  });
});

describe('Run statuses', () => {
  it('should include all expected statuses', () => {
    const expected = [
      'PENDING',
      'APPROVED',
      'RUNNING',
      'COMPLETED',
      'FAILED',
      'CANCEL_REQUESTED',
      'CANCELLED',
      'REJECTED',
    ];
    for (const status of expected) {
      expect(RUN_STATUSES).toContain(status);
    }
    expect(RUN_STATUSES).toHaveLength(8);
  });
});

describe('Run purposes', () => {
  it('should include all expected purposes', () => {
    expect(RUN_PURPOSES).toContain('summarization');
    expect(RUN_PURPOSES).toContain('personalization');
    expect(RUN_PURPOSES).toContain('kb_chat');
    expect(RUN_PURPOSES).toContain('kb_ingestion');
    expect(RUN_PURPOSES).toHaveLength(4);
  });
});

describe('Run transitions (state machine)', () => {
  it('should have entries for every RUN_STATUS', () => {
    for (const status of RUN_STATUSES) {
      expect(RUN_TRANSITIONS).toHaveProperty(status);
      expect(Array.isArray(RUN_TRANSITIONS[status])).toBe(true);
    }
  });

  it('should only contain valid target statuses', () => {
    for (const [from, targets] of Object.entries(RUN_TRANSITIONS)) {
      for (const target of targets) {
        expect(RUN_STATUSES).toContain(target);
      }
    }
  });

  it('PENDING can go to APPROVED or REJECTED only', () => {
    expect([...RUN_TRANSITIONS.PENDING].sort()).toEqual(['APPROVED', 'REJECTED'].sort());
  });

  it('terminal states have no outgoing transitions', () => {
    expect(RUN_TRANSITIONS.COMPLETED).toHaveLength(0);
    expect(RUN_TRANSITIONS.FAILED).toHaveLength(0);
    expect(RUN_TRANSITIONS.CANCELLED).toHaveLength(0);
    expect(RUN_TRANSITIONS.REJECTED).toHaveLength(0);
  });

  it('RUNNING can be cancelled or finish', () => {
    expect(RUN_TRANSITIONS.RUNNING).toContain('COMPLETED');
    expect(RUN_TRANSITIONS.RUNNING).toContain('FAILED');
    expect(RUN_TRANSITIONS.RUNNING).toContain('CANCEL_REQUESTED');
  });

  it('CANCEL_REQUESTED can finish normally or be cancelled', () => {
    expect(RUN_TRANSITIONS.CANCEL_REQUESTED).toContain('CANCELLED');
    expect(RUN_TRANSITIONS.CANCEL_REQUESTED).toContain('COMPLETED');
    expect(RUN_TRANSITIONS.CANCEL_REQUESTED).toContain('FAILED');
  });
});

describe('Default budgets', () => {
  it('should have a budget for every run purpose', () => {
    for (const purpose of RUN_PURPOSES) {
      expect(DEFAULT_BUDGETS[purpose]).toBeDefined();
    }
  });

  it('each budget should have maxTokens, maxDurationMs, estimatedCostUsd', () => {
    for (const purpose of RUN_PURPOSES) {
      const budget = DEFAULT_BUDGETS[purpose];
      expect(budget.maxTokens).toBeGreaterThan(0);
      expect(budget.maxDurationMs).toBeGreaterThan(0);
      expect(budget.estimatedCostUsd).toBeGreaterThanOrEqual(0);
    }
  });

  it('kb_ingestion should have the highest budget', () => {
    const kbIngestion = DEFAULT_BUDGETS.kb_ingestion;
    for (const purpose of RUN_PURPOSES) {
      if (purpose !== 'kb_ingestion') {
        expect(kbIngestion.maxTokens).toBeGreaterThan(DEFAULT_BUDGETS[purpose].maxTokens);
      }
    }
  });
});

describe('Run log events', () => {
  it('should include lifecycle events', () => {
    expect(RUN_LOG_EVENTS).toContain('created');
    expect(RUN_LOG_EVENTS).toContain('approved');
    expect(RUN_LOG_EVENTS).toContain('started');
    expect(RUN_LOG_EVENTS).toContain('completed');
    expect(RUN_LOG_EVENTS).toContain('failed');
    expect(RUN_LOG_EVENTS).toContain('cancelled');
  });

  it('should include budget events', () => {
    expect(RUN_LOG_EVENTS).toContain('budget_warning');
    expect(RUN_LOG_EVENTS).toContain('budget_exceeded');
  });
});

describe('Journey statuses', () => {
  it('should include all lifecycle statuses', () => {
    expect(JOURNEY_STATUSES).toEqual(['draft', 'active', 'completed', 'archived']);
  });
});

describe('Step statuses', () => {
  it('should include all progression statuses', () => {
    expect(STEP_STATUSES).toEqual([
      'locked',
      'available',
      'in_progress',
      'submitted',
      'reviewed',
      'completed',
    ]);
  });
});

describe('Evidence types', () => {
  it('should include all evidence types', () => {
    expect(EVIDENCE_TYPES).toContain('file');
    expect(EVIDENCE_TYPES).toContain('screenshot');
    expect(EVIDENCE_TYPES).toContain('url');
    expect(EVIDENCE_TYPES).toContain('text');
    expect(EVIDENCE_TYPES).toContain('metric');
  });
});

describe('Comfort levels', () => {
  it('should have 3 levels', () => {
    expect(COMFORT_LEVELS).toEqual(['beginner', 'intermediate', 'advanced']);
  });
});

describe('Article statuses', () => {
  it('should cover full pipeline lifecycle', () => {
    expect(ARTICLE_STATUSES).toContain('fetched');
    expect(ARTICLE_STATUSES).toContain('extracted');
    expect(ARTICLE_STATUSES).toContain('deduped');
    expect(ARTICLE_STATUSES).toContain('quality_passed');
    expect(ARTICLE_STATUSES).toContain('summarized');
    expect(ARTICLE_STATUSES).toContain('ingested');
    expect(ARTICLE_STATUSES).toContain('rejected');
  });
});

describe('KPI categories', () => {
  it('should include all categories', () => {
    expect(KPI_CATEGORIES).toEqual(['step_outcome', 'journey_progress', 'org_level']);
  });
});

describe('Measurement types', () => {
  it('should include all measurement types', () => {
    expect(MEASUREMENT_TYPES).toEqual(['numeric', 'percentage', 'boolean', 'rubric']);
  });
});
