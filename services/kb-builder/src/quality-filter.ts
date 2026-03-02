import type { Article } from "@aijourney/shared";
import { getArticlesByStatus, updateArticleStatus } from "./article-repository.js";
import { log } from "./log-stream.js";

/** Quality scoring thresholds */
const QUALITY_THRESHOLD = 40;
const MIN_WORD_COUNT = 200;
const MAX_AGE_DAYS = 365 * 3; // 3 years

export interface QualityResult {
	passed: number;
	failed: number;
	errors: string[];
}

/**
 * Compute a quality score (0–100) for an article.
 *
 * Factors:
 *   - Content length (25%): 200–2000 words → 0–25
 *   - Recency (25%): published within MAX_AGE_DAYS → 0–25
 *   - Title quality (25%): has a unique, non-generic title → 0–25
 *   - Structure (25%): word count as a proxy for depth → 0–25
 */
export function computeQualityScore(article: Article): number {
	let score = 0;

	// Content length factor (25 pts)
	const words = article.metadata.wordCount;
	if (words >= 2000) {
		score += 25;
	} else if (words >= MIN_WORD_COUNT) {
		score += Math.round(((words - MIN_WORD_COUNT) / (2000 - MIN_WORD_COUNT)) * 25);
	}
	// Below MIN_WORD_COUNT → 0 pts

	// Recency factor (25 pts)
	const publishedAt = article.metadata.publishedAt;
	if (publishedAt) {
		const ageDays = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24);
		if (ageDays <= 30) {
			score += 25;
		} else if (ageDays <= 365) {
			score += 20;
		} else if (ageDays <= MAX_AGE_DAYS) {
			score += Math.max(5, Math.round(25 * (1 - ageDays / MAX_AGE_DAYS)));
		}
		// Older than MAX_AGE_DAYS → 0 pts
	} else {
		// Unknown publish date — give middle score
		score += 12;
	}

	// Title quality factor (25 pts)
	const title = article.title;
	const genericPatterns = [
		/^[^|–—-]+['']?s?\s+(weblog|blog|homepage|website)$/i,
		/^(home|about|contact|privacy|terms|tag|category|archive)/i,
		/^(page \d|untitled)/i,
	];
	const isGenericTitle = genericPatterns.some((p) => p.test(title));
	if (!isGenericTitle && title.length > 10 && title.length < 200) {
		score += 25;
	} else if (!isGenericTitle && title.length > 5) {
		score += 15;
	}
	// Generic or very short title → 0 pts

	// Structure/depth factor (25 pts) — using word count as proxy
	if (words >= 1500) {
		score += 25;
	} else if (words >= 800) {
		score += 20;
	} else if (words >= 400) {
		score += 15;
	} else if (words >= MIN_WORD_COUNT) {
		score += 10;
	}

	return Math.min(100, Math.max(0, score));
}

/**
 * Run quality filter on all articles with status "fetched".
 * Updates each to "quality_passed" or "quality_failed" with a qualityScore.
 */
export async function runQualityFilter(): Promise<QualityResult> {
	const articles = await getArticlesByStatus("fetched");
	const result: QualityResult = { passed: 0, failed: 0, errors: [] };

	log("info", `Quality filter: processing ${articles.length} fetched articles`, {
		count: articles.length,
	});

	for (const article of articles) {
		try {
			const score = computeQualityScore(article);
			const passed = score >= QUALITY_THRESHOLD;
			const newStatus = passed ? "quality_passed" : "quality_failed";

			await updateArticleStatus(article.id, newStatus, { qualityScore: score });

			if (passed) {
				result.passed++;
			} else {
				result.failed++;
			}

			log("debug", `Quality: ${article.title.slice(0, 60)} → ${score}/100 (${newStatus})`, {
				articleId: article.id,
				score,
				status: newStatus,
			});
		} catch (err) {
			const msg = `Quality filter failed for ${article.id}: ${err instanceof Error ? err.message : String(err)}`;
			result.errors.push(msg);
			log("error", msg, { articleId: article.id });
		}
	}

	log("info", `Quality filter complete: ${result.passed} passed, ${result.failed} failed, ${result.errors.length} errors`, {
		passed: result.passed,
		failed: result.failed,
		errors: result.errors.length,
	});

	return result;
}
