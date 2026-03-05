import * as cheerio from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing the module
vi.mock('./article-repository.js', () => ({
  saveArticle: vi.fn(),
  getArticleByUrl: vi.fn(),
  hashContent: vi.fn().mockReturnValue('mock-hash-abc123'),
}));

vi.mock('./log-stream.js', () => ({
  log: vi.fn(),
}));

import { getArticleByUrl, hashContent, saveArticle } from './article-repository.js';
import type { CrawlSource } from './crawl-sources.js';
// Import after mocks are set up
import { crawlSource, extractArticleText, getProgress } from './crawler.js';

// Save and mock fetch
let originalFetch: typeof globalThis.fetch;

describe('crawler', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('getProgress', () => {
    it('should return initial idle progress', () => {
      const progress = getProgress();

      expect(progress.status).toBe('idle');
      expect(progress.totalLinksFound).toBe(0);
      expect(progress.totalProcessed).toBe(0);
      expect(progress.totalNew).toBe(0);
      expect(progress.totalSkipped).toBe(0);
      expect(progress.errors).toEqual([]);
    });

    it('should return a copy (not a reference)', () => {
      const p1 = getProgress();
      const p2 = getProgress();

      expect(p1).toEqual(p2);
      expect(p1).not.toBe(p2);
      expect(p1.articles).not.toBe(p2.articles);
    });
  });

  describe('extractArticleText', () => {
    it('should fetch URL and return extracted text', async () => {
      const html = `<html><body>
				<article><h1>Test Article</h1><p>This is the article content with enough words to pass any minimum threshold in the system.</p></article>
			</body></html>`;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => html,
      });

      const text = await extractArticleText('https://example.com/article');

      expect(text).toContain('article content');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com/article',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('MitoAIJourney'),
          }),
        }),
      );
    });

    it('should throw on HTTP error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(extractArticleText('https://example.com/missing')).rejects.toThrow('HTTP 404');
    });
  });

  describe('crawlSource', () => {
    const testSource: CrawlSource = {
      id: 'test-source',
      name: 'Test Source',
      url: 'https://example.com/blog',
      maxPages: 3,
    };

    it('should discover links and process articles', async () => {
      const mainPageHtml = `<html><body>
				<a href="/article-1">Article 1</a>
				<a href="/article-2">Article 2</a>
				<a href="https://other.com/external">External</a>
			</body></html>`;

      const articleHtml = `<html>
				<head><title>Test Article</title></head>
				<body><article><p>${'word '.repeat(100)}</p></article></body>
			</html>`;

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, text: async () => mainPageHtml })
        .mockResolvedValue({ ok: true, text: async () => articleHtml });

      vi.mocked(getArticleByUrl).mockResolvedValue(null);
      vi.mocked(saveArticle).mockImplementation(async (data: any) => ({
        ...data,
        id: 'new-article-id',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }));

      await crawlSource(testSource);

      const progress = getProgress();
      expect(progress.status).toBe('completed');
      expect(progress.totalNew).toBeGreaterThan(0);
      expect(progress.source).toBe('Test Source');
    });

    it('should skip already-existing articles', async () => {
      const mainPageHtml = `<html><body>
				<a href="/existing-article">Existing</a>
			</body></html>`;

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, text: async () => mainPageHtml })
        .mockResolvedValue({ ok: true, text: async () => '<html></html>' });

      vi.mocked(getArticleByUrl).mockResolvedValue({
        id: 'existing-id',
        url: 'https://example.com/existing-article',
      } as any);

      await crawlSource(testSource);

      const progress = getProgress();
      expect(progress.totalSkipped).toBeGreaterThanOrEqual(1);
      expect(saveArticle).not.toHaveBeenCalled();
    });

    it('should skip very short content', async () => {
      const mainPageHtml = `<html><body><a href="/short">Short</a></body></html>`;
      const shortHtml = `<html><body><article><p>Too short.</p></article></body></html>`;

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, text: async () => mainPageHtml })
        .mockResolvedValue({ ok: true, text: async () => shortHtml });

      vi.mocked(getArticleByUrl).mockResolvedValue(null);

      await crawlSource(testSource);

      const progress = getProgress();
      // Short content (< 50 words) should be skipped
      expect(saveArticle).not.toHaveBeenCalled();
    });

    it('should handle fetch failures gracefully', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await crawlSource(testSource);

      const progress = getProgress();
      expect(progress.status).toBe('failed');
      expect(progress.errors.length).toBeGreaterThan(0);
    });
  });
});
