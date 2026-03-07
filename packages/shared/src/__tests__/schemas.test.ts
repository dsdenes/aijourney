import { describe, expect, it } from 'vitest';
import {
  bulkInviteSchema,
  cancelRunRequestSchema,
  createInvitationSchema,
  createJourneySchema,
  createRunRequestSchema,
  createTenantSchema,
  createUserSchema,
  updateJourneySchema,
  updateTenantSchema,
  updateUserSchema,
} from '../index.js';

describe('createUserSchema', () => {
  const validUser = {
    googleId: 'google-123',
    email: 'testuser@mito.hu',
    name: 'Test User',
    tenantId: 'tenant-001',
  };

  it('should accept valid user input', () => {
    const result = createUserSchema.safeParse(validUser);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('testuser@mito.hu');
      expect(result.data.role).toBe('employee'); // default
    }
  });

  it('should accept valid user with all optional fields', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      avatarUrl: 'https://example.com/avatar.jpg',
      role: 'admin',
      globalRole: 'superadmin',
      orgRole: 'owner',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe('admin');
      expect(result.data.avatarUrl).toBe('https://example.com/avatar.jpg');
      expect(result.data.globalRole).toBe('superadmin');
      expect(result.data.orgRole).toBe('owner');
    }
  });

  it('should accept any email domain (multi-tenant)', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      email: 'user@gmail.com',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email format', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty googleId', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      googleId: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty name', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject name over 200 characters', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      name: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid role', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      role: 'superadmin',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid avatarUrl', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      avatarUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing required fields', () => {
    expect(createUserSchema.safeParse({}).success).toBe(false);
    expect(createUserSchema.safeParse({ googleId: 'g' }).success).toBe(false);
    expect(createUserSchema.safeParse({ googleId: 'g', email: 'test@mito.hu' }).success).toBe(
      false,
    );
  });
});

describe('updateUserSchema', () => {
  it('should accept partial updates', () => {
    const result = updateUserSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('should accept empty object (no updates)', () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept all optional fields', () => {
    const result = updateUserSchema.safeParse({
      name: 'Updated Name',
      department: 'Engineering',
      jobTitle: 'Senior Developer',
      jobDescription: 'Building AI tools',
      preferences: {
        tools: ['ChatGPT', 'Copilot'],
        workflows: ['code review'],
        comfortLevel: 'intermediate',
        goals: ['Improve productivity'],
      },
      onboardingComplete: true,
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid comfort level in preferences', () => {
    const result = updateUserSchema.safeParse({
      preferences: { comfortLevel: 'expert' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject name over 200 characters', () => {
    const result = updateUserSchema.safeParse({ name: 'a'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('should reject department over 100 characters', () => {
    const result = updateUserSchema.safeParse({
      department: 'a'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it('should accept preferences with completedPractices', () => {
    const result = updateUserSchema.safeParse({
      preferences: { completedPractices: [1, 5, 10, 25] },
    });
    expect(result.success).toBe(true);
  });

  it('should reject completedPractices with out-of-range IDs', () => {
    const result = updateUserSchema.safeParse({
      preferences: { completedPractices: [0] },
    });
    expect(result.success).toBe(false);
  });

  it('should reject completedPractices with IDs above 25', () => {
    const result = updateUserSchema.safeParse({
      preferences: { completedPractices: [26] },
    });
    expect(result.success).toBe(false);
  });

  it('should accept empty completedPractices array', () => {
    const result = updateUserSchema.safeParse({
      preferences: { completedPractices: [] },
    });
    expect(result.success).toBe(true);
  });
});

describe('createJourneySchema', () => {
  const validJourney = {
    userId: 'user-123',
    title: 'My AI Journey',
    description: 'A journey into AI integration',
    competencyAreas: ['prompt-engineering'],
    metadata: {
      estimatedDurationWeeks: 8,
      difficultyProgression: 'linear',
      roleCategory: 'developer',
    },
  };

  it('should accept valid journey input', () => {
    const result = createJourneySchema.safeParse(validJourney);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currentLevel).toBe('L0'); // default
    }
  });

  it('should accept custom currentLevel', () => {
    const result = createJourneySchema.safeParse({
      ...validJourney,
      currentLevel: 'L2',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currentLevel).toBe('L2');
    }
  });

  it('should reject empty competencyAreas', () => {
    const result = createJourneySchema.safeParse({
      ...validJourney,
      competencyAreas: [],
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty userId', () => {
    const result = createJourneySchema.safeParse({
      ...validJourney,
      userId: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty title', () => {
    const result = createJourneySchema.safeParse({
      ...validJourney,
      title: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject title over 500 characters', () => {
    const result = createJourneySchema.safeParse({
      ...validJourney,
      title: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid currentLevel', () => {
    const result = createJourneySchema.safeParse({
      ...validJourney,
      currentLevel: 'L5',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing metadata fields', () => {
    const result = createJourneySchema.safeParse({
      ...validJourney,
      metadata: { estimatedDurationWeeks: 8 }, // missing other fields
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-positive estimatedDurationWeeks', () => {
    const result = createJourneySchema.safeParse({
      ...validJourney,
      metadata: {
        ...validJourney.metadata,
        estimatedDurationWeeks: 0,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('updateJourneySchema', () => {
  it('should accept partial updates', () => {
    expect(updateJourneySchema.safeParse({ title: 'New Title' }).success).toBe(true);
    expect(updateJourneySchema.safeParse({ status: 'active' }).success).toBe(true);
    expect(updateJourneySchema.safeParse({ currentLevel: 'L3' }).success).toBe(true);
  });

  it('should reject invalid status', () => {
    expect(updateJourneySchema.safeParse({ status: 'deleted' }).success).toBe(false);
  });

  it('should reject invalid currentLevel', () => {
    expect(updateJourneySchema.safeParse({ currentLevel: 'L99' }).success).toBe(false);
  });

  it('should accept empty object', () => {
    expect(updateJourneySchema.safeParse({}).success).toBe(true);
  });
});

describe('createRunRequestSchema', () => {
  const validRun = {
    purpose: 'kb_chat',
    inputs: {
      promptHash: 'sha256-abc123',
      prompt: 'Tell me about AI tools',
    },
  };

  it('should accept valid run request', () => {
    const result = createRunRequestSchema.safeParse(validRun);
    expect(result.success).toBe(true);
  });

  it('should accept run request with custom budget', () => {
    const result = createRunRequestSchema.safeParse({
      ...validRun,
      budget: {
        maxTokens: 5000,
        maxDurationMs: 45000,
        estimatedCostUsd: 0.03,
      },
    });
    expect(result.success).toBe(true);
  });

  it('should accept all valid purposes', () => {
    for (const purpose of ['summarization', 'personalization', 'kb_chat', 'kb_ingestion']) {
      const result = createRunRequestSchema.safeParse({
        ...validRun,
        purpose,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid purpose', () => {
    const result = createRunRequestSchema.safeParse({
      ...validRun,
      purpose: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing promptHash', () => {
    const result = createRunRequestSchema.safeParse({
      purpose: 'kb_chat',
      inputs: { prompt: 'hello' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty promptHash', () => {
    const result = createRunRequestSchema.safeParse({
      purpose: 'kb_chat',
      inputs: { promptHash: '' },
    });
    expect(result.success).toBe(false);
  });

  it('should accept inputs with optional context and sourceDocIds', () => {
    const result = createRunRequestSchema.safeParse({
      purpose: 'summarization',
      inputs: {
        promptHash: 'sha256-xyz',
        context: { key: 'value' },
        sourceDocIds: ['doc-1', 'doc-2'],
      },
    });
    expect(result.success).toBe(true);
  });

  it('should reject non-positive budget values', () => {
    const result = createRunRequestSchema.safeParse({
      ...validRun,
      budget: {
        maxTokens: 0,
        maxDurationMs: 1000,
        estimatedCostUsd: 0.01,
      },
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative estimatedCostUsd', () => {
    const result = createRunRequestSchema.safeParse({
      ...validRun,
      budget: {
        maxTokens: 1000,
        maxDurationMs: 1000,
        estimatedCostUsd: -1,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('cancelRunRequestSchema', () => {
  it('should accept empty object', () => {
    expect(cancelRunRequestSchema.safeParse({}).success).toBe(true);
  });

  it('should accept with reason', () => {
    const result = cancelRunRequestSchema.safeParse({
      reason: 'No longer needed',
    });
    expect(result.success).toBe(true);
  });

  it('should reject reason over 500 characters', () => {
    const result = cancelRunRequestSchema.safeParse({
      reason: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────
// Tenant schemas
// ────────────────────────────────────────────────────

describe('createTenantSchema', () => {
  it('should accept valid input with defaults', () => {
    const result = createTenantSchema.safeParse({
      name: 'Mito AI',
      slug: 'mito-ai',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plan).toBe('free');
    }
  });

  it('should accept with explicit plan', () => {
    const result = createTenantSchema.safeParse({
      name: 'Enterprise Corp',
      slug: 'enterprise-corp',
      plan: 'enterprise',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plan).toBe('enterprise');
    }
  });

  it('should reject empty name', () => {
    const result = createTenantSchema.safeParse({
      name: '',
      slug: 'valid-slug',
    });
    expect(result.success).toBe(false);
  });

  it('should reject name over 200 chars', () => {
    const result = createTenantSchema.safeParse({
      name: 'a'.repeat(201),
      slug: 'valid-slug',
    });
    expect(result.success).toBe(false);
  });

  it('should reject slug with uppercase letters', () => {
    const result = createTenantSchema.safeParse({
      name: 'Test',
      slug: 'Invalid-Slug',
    });
    expect(result.success).toBe(false);
  });

  it('should reject slug with spaces', () => {
    const result = createTenantSchema.safeParse({
      name: 'Test',
      slug: 'has space',
    });
    expect(result.success).toBe(false);
  });

  it('should reject slug shorter than 2 chars', () => {
    const result = createTenantSchema.safeParse({
      name: 'Test',
      slug: 'a',
    });
    expect(result.success).toBe(false);
  });

  it('should reject slug longer than 50 chars', () => {
    const result = createTenantSchema.safeParse({
      name: 'Test',
      slug: 'a'.repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid plan', () => {
    const result = createTenantSchema.safeParse({
      name: 'Test',
      slug: 'test',
      plan: 'premium',
    });
    expect(result.success).toBe(false);
  });

  it('should accept slug with hyphens and numbers', () => {
    const result = createTenantSchema.safeParse({
      name: 'Test 123',
      slug: 'test-org-123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const result = createTenantSchema.safeParse({
      slug: 'valid-slug',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing slug', () => {
    const result = createTenantSchema.safeParse({
      name: 'Valid Name',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateTenantSchema', () => {
  it('should accept partial name update', () => {
    const result = updateTenantSchema.safeParse({
      name: 'New Name',
    });
    expect(result.success).toBe(true);
  });

  it('should accept settings with displayName', () => {
    const result = updateTenantSchema.safeParse({
      settings: { displayName: 'My Org' },
    });
    expect(result.success).toBe(true);
  });

  it('should accept settings with logoUrl', () => {
    const result = updateTenantSchema.safeParse({
      settings: { logoUrl: 'https://example.com/logo.png' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid logoUrl', () => {
    const result = updateTenantSchema.safeParse({
      settings: { logoUrl: 'not-a-url' },
    });
    expect(result.success).toBe(false);
  });

  it('should accept empty object', () => {
    const result = updateTenantSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject name over 200 chars', () => {
    const result = updateTenantSchema.safeParse({
      name: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────
// Invitation schemas
// ────────────────────────────────────────────────────

describe('createInvitationSchema', () => {
  it('should accept valid email with default role', () => {
    const result = createInvitationSchema.safeParse({
      email: 'user@example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orgRole).toBe('member');
    }
  });

  it('should accept with explicit orgRole', () => {
    const result = createInvitationSchema.safeParse({
      email: 'admin@example.com',
      orgRole: 'admin',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orgRole).toBe('admin');
    }
  });

  it('should accept owner orgRole', () => {
    const result = createInvitationSchema.safeParse({
      email: 'owner@example.com',
      orgRole: 'owner',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = createInvitationSchema.safeParse({
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid orgRole', () => {
    const result = createInvitationSchema.safeParse({
      email: 'user@example.com',
      orgRole: 'superuser',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing email', () => {
    const result = createInvitationSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('bulkInviteSchema', () => {
  it('should accept valid array of emails', () => {
    const result = bulkInviteSchema.safeParse({
      emails: ['a@b.com', 'c@d.com'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orgRole).toBe('member');
    }
  });

  it('should accept with explicit orgRole', () => {
    const result = bulkInviteSchema.safeParse({
      emails: ['a@b.com'],
      orgRole: 'admin',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty emails array', () => {
    const result = bulkInviteSchema.safeParse({
      emails: [],
    });
    expect(result.success).toBe(false);
  });

  it('should reject more than 50 emails', () => {
    const emails = Array.from({ length: 51 }, (_, i) => `user${i}@example.com`);
    const result = bulkInviteSchema.safeParse({ emails });
    expect(result.success).toBe(false);
  });

  it('should reject invalid emails in array', () => {
    const result = bulkInviteSchema.safeParse({
      emails: ['valid@test.com', 'not-an-email'],
    });
    expect(result.success).toBe(false);
  });

  it('should accept exactly 50 emails', () => {
    const emails = Array.from({ length: 50 }, (_, i) => `user${i}@example.com`);
    const result = bulkInviteSchema.safeParse({ emails });
    expect(result.success).toBe(true);
  });

  it('should reject missing emails field', () => {
    const result = bulkInviteSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
