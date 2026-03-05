import { describe, expect, it } from 'vitest';
import {
  comfortLevelFromPractices,
  generateId,
  isValidTransition,
  nowISO,
  TOTAL_PRACTICES,
} from '../utils/index.js';

describe('generateId', () => {
  it('should return a ULID string of 26 characters', () => {
    const id = generateId();
    expect(id).toHaveLength(26);
    // ULIDs are base32 Crockford: 0-9 A-Z excluding I L O U
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('should generate unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('should be time-sortable (later IDs sort higher)', async () => {
    const id1 = generateId();
    // Small delay to ensure different millisecond
    await new Promise((r) => setTimeout(r, 2));
    const id2 = generateId();
    expect(id2 > id1).toBe(true);
  });
});

describe('nowISO', () => {
  it('should return a valid ISO 8601 string', () => {
    const ts = nowISO();
    const date = new Date(ts);
    expect(date.toISOString()).toBe(ts);
  });

  it('should end with Z (UTC)', () => {
    expect(nowISO()).toMatch(/Z$/);
  });

  it('should be close to current time', () => {
    const before = Date.now();
    const ts = nowISO();
    const after = Date.now();
    const parsed = new Date(ts).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});

describe('isValidTransition', () => {
  const transitions: Record<string, readonly string[]> = {
    PENDING: ['APPROVED', 'REJECTED'],
    APPROVED: ['RUNNING', 'CANCELLED'],
    RUNNING: ['COMPLETED', 'FAILED', 'CANCEL_REQUESTED'],
    CANCEL_REQUESTED: ['CANCELLED', 'COMPLETED', 'FAILED'],
    COMPLETED: [],
    FAILED: [],
    CANCELLED: [],
    REJECTED: [],
  };

  it('should allow valid transitions', () => {
    expect(isValidTransition(transitions, 'PENDING', 'APPROVED')).toBe(true);
    expect(isValidTransition(transitions, 'PENDING', 'REJECTED')).toBe(true);
    expect(isValidTransition(transitions, 'APPROVED', 'RUNNING')).toBe(true);
    expect(isValidTransition(transitions, 'RUNNING', 'COMPLETED')).toBe(true);
    expect(isValidTransition(transitions, 'RUNNING', 'CANCEL_REQUESTED')).toBe(true);
    expect(isValidTransition(transitions, 'CANCEL_REQUESTED', 'CANCELLED')).toBe(true);
  });

  it('should reject invalid transitions', () => {
    expect(isValidTransition(transitions, 'PENDING', 'RUNNING')).toBe(false);
    expect(isValidTransition(transitions, 'COMPLETED', 'RUNNING')).toBe(false);
    expect(isValidTransition(transitions, 'FAILED', 'APPROVED')).toBe(false);
    expect(isValidTransition(transitions, 'CANCELLED', 'RUNNING')).toBe(false);
    expect(isValidTransition(transitions, 'REJECTED', 'APPROVED')).toBe(false);
  });

  it('should reject transitions from unknown states', () => {
    expect(isValidTransition(transitions, 'UNKNOWN', 'APPROVED')).toBe(false);
  });

  it('should handle terminal states (no valid transitions out)', () => {
    for (const terminal of ['COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED']) {
      for (const target of ['PENDING', 'APPROVED', 'RUNNING', 'COMPLETED', 'FAILED']) {
        expect(isValidTransition(transitions, terminal, target)).toBe(false);
      }
    }
  });
});

describe('TOTAL_PRACTICES', () => {
  it('should be 25', () => {
    expect(TOTAL_PRACTICES).toBe(25);
  });
});

describe('comfortLevelFromPractices', () => {
  it('should return beginner for 0 completed', () => {
    expect(comfortLevelFromPractices(0)).toBe('beginner');
  });

  it('should return beginner for 1-8 completed', () => {
    for (const n of [1, 4, 8]) {
      expect(comfortLevelFromPractices(n)).toBe('beginner');
    }
  });

  it('should return intermediate for 9-16 completed', () => {
    for (const n of [9, 12, 16]) {
      expect(comfortLevelFromPractices(n)).toBe('intermediate');
    }
  });

  it('should return advanced for 17-25 completed', () => {
    for (const n of [17, 20, 25]) {
      expect(comfortLevelFromPractices(n)).toBe('advanced');
    }
  });

  it('should return advanced for counts above 25', () => {
    expect(comfortLevelFromPractices(30)).toBe('advanced');
  });
});
