import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleKbChatJob } from './kb-chat.worker.js';
import { handlePersonalizationJob } from './personalization.worker.js';
import { handleSummarizationJob } from './summarization.worker.js';

// Mock OpenAI
vi.mock('openai', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content:
            '{"steps":[{"title":"Step 1","description":"Learn basics","task":"Do X","expectedOutput":"Y","estimatedMinutes":30,"tags":["tools"],"toolsRequired":["chatgpt"]}]}',
        },
      },
    ],
    usage: { total_tokens: 500 },
  });
  return {
    default: class {
      chat = { completions: { create: mockCreate } };
    },
  };
});

// Mock process.env
beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.PIPELINE_POLL_INTERVAL_MS = '10'; // Speed up pollinig in tests
});

// Create mock job objects
function createMockJob(data: Record<string, unknown>) {
  return {
    id: 'test-job-1',
    data,
    name: 'test',
    progress: vi.fn(),
    log: vi.fn(),
    updateProgress: vi.fn(),
  } as any;
}

// Create a mock fetch that returns configurable responses
function createMockFetch(responses: Record<string, unknown> = {}) {
  return vi.fn().mockImplementation(async (url: string) => {
    const urlStr = String(url);

    // KB Builder summaries
    if (urlStr.includes('/summaries')) {
      return {
        ok: true,
        json: async () => ({
          data: responses.summaries ?? [
            {
              id: 's1',
              articleId: 'a1',
              content: {
                title: 'AI Best Practices',
                keyPoints: ['Use AI responsibly'],
                dos: ['Test outputs'],
                donts: ['Trust blindly'],
                tags: ['tools', 'strategy'],
                difficulty: 'beginner',
                roleRelevance: [{ role: 'engineering', relevanceScore: 0.8 }],
              },
            },
          ],
        }),
      };
    }

    // KB Builder pipeline trigger
    if (urlStr.includes('/pipeline/progress')) {
      return {
        ok: true,
        json: async () => ({ status: 'completed', stages: {} }),
      };
    }

    if (urlStr.includes('/pipeline')) {
      return { ok: true, json: async () => ({ status: 'started' }) };
    }

    // API users
    if (urlStr.includes('/users/')) {
      return {
        ok: true,
        json: async () => ({
          data: responses.user ?? {
            id: 'user-1',
            name: 'Test User',
            role: 'employee',
            department: 'Engineering',
            jobTitle: 'Developer',
            preferences: {
              comfortLevel: 'intermediate',
              tools: ['chatgpt'],
              goals: ['Learn AI'],
            },
          },
        }),
      };
    }

    // API journeys
    if (urlStr.includes('/journeys/')) {
      return {
        ok: true,
        json: async () => ({
          data: responses.journey ?? {
            id: 'journey-1',
            title: 'AI Foundations',
            description: 'Learn AI basics',
            currentLevel: 'L1',
            competencyAreas: ['tools', 'prompt-engineering'],
            metadata: {
              estimatedDurationWeeks: 4,
              difficultyProgression: 'gradual',
              roleCategory: 'engineering',
            },
          },
        }),
      };
    }

    return { ok: false, status: 404, text: async () => 'Not found' };
  });
}

describe('Summarization Worker', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = createMockFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should trigger KB Builder pipeline and complete', async () => {
    const job = createMockJob({
      runRequestId: 'run-1',
      articleId: 'article-1',
    });

    const result = await handleSummarizationJob(job);

    expect(result).toMatchObject({
      runRequestId: 'run-1',
      articleId: 'article-1',
      status: 'completed',
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(job.updateProgress).toHaveBeenCalled();
    expect(job.log).toHaveBeenCalledWith(expect.stringContaining('start'));
  });

  it('should handle pipeline trigger failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    });

    const job = createMockJob({
      runRequestId: 'run-2',
      articleId: 'art-2',
    });

    await expect(handleSummarizationJob(job)).rejects.toThrow('KB Builder pipeline returned 500');
  });
});

describe('Personalization Worker', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = createMockFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should generate personalized steps and complete', async () => {
    const job = createMockJob({
      runRequestId: 'run-1',
      userId: 'user-1',
      journeyId: 'journey-1',
    });

    const result = await handlePersonalizationJob(job);

    expect(result).toMatchObject({
      runRequestId: 'run-1',
      userId: 'user-1',
      journeyId: 'journey-1',
      status: 'completed',
    });
    expect(result.stepsGenerated).toBeGreaterThan(0);
    expect(result.tokensUsed).toBe(500);
    expect(result.model).toBeDefined();
    expect(job.updateProgress).toHaveBeenCalled();
  });

  it('should log processing details', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const job = createMockJob({
      runRequestId: 'run-2',
      userId: 'user-2',
      journeyId: 'j-2',
    });

    await handlePersonalizationJob(job);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('run=run-2'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('user=user-2'));

    consoleSpy.mockRestore();
  });
});

describe('KB Chat Worker', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = createMockFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should call OpenAI with KB context and complete', async () => {
    const job = createMockJob({
      runRequestId: 'run-1',
      userId: 'user-1',
      query: 'Tell me about AI',
    });

    const result = await handleKbChatJob(job);

    expect(result).toMatchObject({
      runRequestId: 'run-1',
      userId: 'user-1',
      query: 'Tell me about AI',
      status: 'completed',
    });
    expect(result.answer).toBeDefined();
    expect(result.tokensUsed).toBe(500);
    expect(result.sourcesCount).toBeGreaterThan(0);
    expect(job.updateProgress).toHaveBeenCalled();
  });

  it('should handle KB Builder being unavailable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const job = createMockJob({
      runRequestId: 'run-2',
      userId: 'user-2',
      query: 'test query',
    });

    // Should still work (proceeds without KB context)
    const result = await handleKbChatJob(job);

    expect(result.status).toBe('completed');
    expect(result.sourcesCount).toBe(0);
  });

  it('should log processing with user context', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const job = createMockJob({
      runRequestId: 'run-3',
      userId: 'user-3',
      query: 'What is AI?',
    });

    await handleKbChatJob(job);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('run=run-3'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('user=user-3'));

    consoleSpy.mockRestore();
  });
});
