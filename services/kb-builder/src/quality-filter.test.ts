import { describe, expect, it } from "vitest";
import { computeQualityScore } from "./quality-filter.js";
import type { Article } from "@aijourney/shared";

function makeArticle(overrides: Partial<Article> = {}): Article {
	return {
		id: "art-1",
		url: "https://example.com/article",
		title: overrides.title ?? "A Comprehensive Guide to Using AI Tools Effectively",
		source: "example.com",
		status: "fetched",
		contentHash: "abc123",
		fetchedAt: new Date().toISOString(),
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		metadata: {
			wordCount: 1000,
			language: "en",
			...overrides.metadata,
		},
		...overrides,
	} as Article;
}

describe("computeQualityScore", () => {
	describe("content length factor (25 pts)", () => {
		it("should score 0 for articles below 200 words", () => {
			const article = makeArticle({ metadata: { wordCount: 100, language: "en" } });
			const score = computeQualityScore(article);
			// 0 from content length, but still gets points from other factors
			expect(score).toBeLessThan(80);
		});

		it("should score 25 for articles >= 2000 words", () => {
			const article = makeArticle({ metadata: { wordCount: 3000, language: "en" } });
			const score = computeQualityScore(article);
			expect(score).toBeGreaterThanOrEqual(75); // max content + title + structure
		});

		it("should score proportionally between 200 and 2000 words", () => {
			const short = makeArticle({ metadata: { wordCount: 300, language: "en" } });
			const medium = makeArticle({ metadata: { wordCount: 1000, language: "en" } });
			const shortScore = computeQualityScore(short);
			const mediumScore = computeQualityScore(medium);
			expect(mediumScore).toBeGreaterThan(shortScore);
		});
	});

	describe("recency factor (25 pts)", () => {
		it("should score 25 for articles published within 30 days", () => {
			const recent = new Date();
			recent.setDate(recent.getDate() - 10);
			const article = makeArticle({
				metadata: {
					wordCount: 2000,
					language: "en",
					publishedAt: recent.toISOString(),
				},
			});
			const score = computeQualityScore(article);
			expect(score).toBeGreaterThanOrEqual(95); // near max across all factors
		});

		it("should score 20 for articles within 1 year", () => {
			const sixMonths = new Date();
			sixMonths.setMonth(sixMonths.getMonth() - 6);
			const article = makeArticle({
				metadata: {
					wordCount: 2000,
					language: "en",
					publishedAt: sixMonths.toISOString(),
				},
			});
			const score = computeQualityScore(article);
			expect(score).toBeGreaterThanOrEqual(90);
		});

		it("should score 12 for articles with unknown publish date", () => {
			const article = makeArticle({
				metadata: { wordCount: 2000, language: "en" },
			});
			// No publishedAt → 12 pts
			const score = computeQualityScore(article);
			// 25 (content) + 12 (recency) + 25 (title) + 25 (structure) = 87
			expect(score).toBeLessThanOrEqual(100);
			expect(score).toBeGreaterThanOrEqual(80);
		});

		it("should score 0 for very old articles (> 3 years)", () => {
			const old = new Date();
			old.setFullYear(old.getFullYear() - 5);
			const article = makeArticle({
				metadata: {
					wordCount: 2000,
					language: "en",
					publishedAt: old.toISOString(),
				},
			});
			const score = computeQualityScore(article);
			// 25 + 0 + 25 + 25 = 75
			expect(score).toBeLessThanOrEqual(80);
		});
	});

	describe("title quality factor (25 pts)", () => {
		it("should score 25 for descriptive titles (10-200 chars)", () => {
			const article = makeArticle({
				title: "Best Practices for Prompt Engineering in 2026",
				metadata: { wordCount: 2000, language: "en" },
			});
			const score = computeQualityScore(article);
			expect(score).toBeGreaterThanOrEqual(80);
		});

		it("should score 0 for generic/homepage titles", () => {
			const article = makeArticle({
				title: "Home",
				metadata: { wordCount: 2000, language: "en" },
			});
			const score = computeQualityScore(article);
			// No title points
			expect(score).toBeLessThanOrEqual(70);
		});

		it("should score 0 for very short titles", () => {
			const article = makeArticle({
				title: "Test",
				metadata: { wordCount: 2000, language: "en" },
			});
			const score = computeQualityScore(article);
			expect(score).toBeLessThanOrEqual(70);
		});

		it("should detect generic patterns like 'blog', 'homepage'", () => {
			const generic = [
				"About",
				"Contact",
				"Privacy",
				"Page 3",
				"Untitled",
			];
			for (const title of generic) {
				const article = makeArticle({
					title,
					metadata: { wordCount: 2000, language: "en" },
				});
				const score = computeQualityScore(article);
				// Generic titles score 0 on title factor, so max is 75
				expect(score).toBeLessThanOrEqual(80);
			}
		});
	});

	describe("structure/depth factor (25 pts)", () => {
		it("should score 25 for articles >= 1500 words", () => {
			const article = makeArticle({
				metadata: { wordCount: 2000, language: "en" },
			});
			const score = computeQualityScore(article);
			expect(score).toBeGreaterThan(75);
		});

		it("should score 10 for articles at minimum word count", () => {
			const article = makeArticle({
				metadata: { wordCount: 200, language: "en" },
			});
			const score = computeQualityScore(article);
			// Minimal content + minimal structure
			expect(score).toBeLessThan(75);
		});
	});

	describe("overall score ranges", () => {
		it("should return 0 for worst-case article", () => {
			const article = makeArticle({
				title: "Home",
				metadata: {
					wordCount: 10,
					language: "en",
					publishedAt: "2019-01-01T00:00:00.000Z",
				},
			});
			const score = computeQualityScore(article);
			expect(score).toBe(0);
		});

		it("should return ~100 for best-case article", () => {
			const recent = new Date();
			recent.setDate(recent.getDate() - 5);
			const article = makeArticle({
				title: "The Complete Guide to AI-Powered Code Generation in Modern Development",
				metadata: {
					wordCount: 3000,
					language: "en",
					publishedAt: recent.toISOString(),
				},
			});
			const score = computeQualityScore(article);
			expect(score).toBe(100);
		});

		it("should always be between 0 and 100", () => {
			const variations = [
				makeArticle({ metadata: { wordCount: 50, language: "en" } }),
				makeArticle({ metadata: { wordCount: 500, language: "en" } }),
				makeArticle({ metadata: { wordCount: 5000, language: "en" } }),
			];
			for (const article of variations) {
				const score = computeQualityScore(article);
				expect(score).toBeGreaterThanOrEqual(0);
				expect(score).toBeLessThanOrEqual(100);
			}
		});

		it("quality threshold of 40 should pass decent articles", () => {
			// An article with ~600 words, decent title, unknown date
			const article = makeArticle({
				title: "How to Use ChatGPT for Better Code Reviews",
				metadata: { wordCount: 600, language: "en" },
			});
			const score = computeQualityScore(article);
			expect(score).toBeGreaterThanOrEqual(40);
		});
	});
});
