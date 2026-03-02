import type { Article } from "@aijourney/shared";
import * as cheerio from "cheerio";
import {
	getArticleByUrl,
	hashContent,
	saveArticle,
} from "./article-repository.js";
import type { CrawlSource } from "./crawl-sources.js";
import { log } from "./log-stream.js";

export interface CrawlProgress {
	status: "idle" | "running" | "completed" | "failed";
	source: string;
	totalLinksFound: number;
	totalProcessed: number;
	totalNew: number;
	totalSkipped: number;
	errors: string[];
	startedAt: string | null;
	completedAt: string | null;
	articles: Article[];
}

let currentProgress: CrawlProgress = createEmptyProgress();

function createEmptyProgress(): CrawlProgress {
	return {
		status: "idle",
		source: "",
		totalLinksFound: 0,
		totalProcessed: 0,
		totalNew: 0,
		totalSkipped: 0,
		errors: [],
		startedAt: null,
		completedAt: null,
		articles: [],
	};
}

export function getProgress(): CrawlProgress {
	return { ...currentProgress, articles: [...currentProgress.articles] };
}

/**
 * Fetches a URL and returns the HTML content.
 * Respects a simple timeout and user-agent.
 */
async function fetchPage(url: string): Promise<string> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);
	try {
		const res = await fetch(url, {
			signal: controller.signal as never,
			headers: {
				"User-Agent":
					"MitoAIJourney-KBBuilder/0.1 (internal knowledge base builder)",
				Accept: "text/html,application/xhtml+xml",
			},
		});
		if (!res.ok) {
			throw new Error(`HTTP ${res.status} fetching ${url}`);
		}
		return await res.text();
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Given a base URL, discover all article links from the page.
 * Extracts all <a href> that are on the same domain and look like article/post paths.
 */
function discoverLinks(
	html: string,
	baseUrl: string,
): { links: string[]; title: string } {
	const $ = cheerio.load(html);
	const base = new URL(baseUrl);
	const linkSet = new Set<string>();
	const pageTitle = $("title").text().trim() || base.hostname;

	$("a[href]").each((_i, el) => {
		const href = $(el).attr("href");
		if (!href) return;

		try {
			const resolved = new URL(href, baseUrl);
			// Same domain only
			if (resolved.hostname !== base.hostname) return;
			// Strip hash and query
			resolved.hash = "";
			resolved.search = "";

			const path = resolved.pathname;
			// Skip non-content paths
			if (
				path === "/" ||
				path.endsWith(".xml") ||
				path.endsWith(".json") ||
				path.endsWith(".atom") ||
				path.endsWith(".rss") ||
				path.endsWith(".png") ||
				path.endsWith(".jpg") ||
				path.endsWith(".jpeg") ||
				path.endsWith(".gif") ||
				path.endsWith(".svg") ||
				path.endsWith(".css") ||
				path.endsWith(".js") ||
				path.endsWith(".pdf") ||
				path === "/search/" ||
				path === "/search" ||
				path === "/tags/" ||
				path === "/tags" ||
				path.startsWith("/static/") ||
				path.startsWith("/media/") ||
				path.startsWith("/assets/")
			) {
				return;
			}

			// Must have some meaningful path depth (not just /)
			if (path.length > 1) {
				linkSet.add(resolved.toString());
			}
		} catch {
			// Invalid URL, skip
		}
	});

	return { links: Array.from(linkSet), title: pageTitle };
}

/**
 * Extract article content from a page (title + text).
 */
function extractContent(
	html: string,
	url: string,
): {
	title: string;
	text: string;
	wordCount: number;
	author: string | undefined;
	publishedAt: string | undefined;
} {
	const $ = cheerio.load(html);

	// Extract title BEFORE stripping elements (h1 may be inside header)
	const title =
		$('meta[property="og:title"]').attr("content")?.trim() ||
		$("article h1, .entry-title, h1.post-title, h1").first().text().trim() ||
		$("title").text().trim() ||
		new URL(url).pathname;

	// Look for common author meta / tags (before stripping)
	const author =
		$('meta[name="author"]').attr("content")?.trim() ||
		$(".author, .byline, [rel=author]").first().text().trim() ||
		undefined;

	const publishedAt =
		$('meta[property="article:published_time"]').attr("content") ||
		$("time[datetime]").first().attr("datetime") ||
		undefined;

	// Remove scripts, styles, nav, footer, aside (AFTER extracting metadata)
	$("script, style, nav, footer, aside, header, .sidebar, .comments").remove();

	// Extract main content
	const articleEl = $("article, .entry-content, .post-content, main, .content");
	const text = (articleEl.length > 0 ? articleEl : $("body"))
		.text()
		.replace(/\s+/g, " ")
		.trim();

	const wordCount = text.split(/\s+/).length;

	return { title, text, wordCount, author, publishedAt };
}

/**
 * Fetch a URL and extract its main text content.
 * Used by the summarizer to get article text for OpenAI.
 */
export async function extractArticleText(url: string): Promise<string> {
	const html = await fetchPage(url);
	const content = extractContent(html, url);
	return content.text;
}

/**
 * Crawl all enabled sources and store articles in DynamoDB.
 */
export async function crawlSource(source: CrawlSource): Promise<void> {
	currentProgress = {
		...createEmptyProgress(),
		status: "running",
		source: source.name,
		startedAt: new Date().toISOString(),
	};

	try {
		log("info", `Starting crawl of ${source.url}`, {
			sourceId: source.id,
			url: source.url,
		});

		// Step 1: Fetch the main page and discover links
		const mainHtml = await fetchPage(source.url);
		const { links } = discoverLinks(mainHtml, source.url);

		// Limit to maxPages
		const linksToProcess = links.slice(0, source.maxPages);
		currentProgress.totalLinksFound = links.length;

		log(
			"info",
			`Found ${links.length} links on ${source.url}, processing up to ${linksToProcess.length}`,
			{
				totalLinks: links.length,
				processing: linksToProcess.length,
			},
		);

		// Step 2: Process each link
		for (const link of linksToProcess) {
			try {
				// Check if already exists
				const existing = await getArticleByUrl(link);
				if (existing) {
					currentProgress.totalSkipped++;
					currentProgress.totalProcessed++;
					log("debug", `Skip (already exists): ${link}`, { url: link });
					continue;
				}

				// Fetch the page
				log("info", `Fetching: ${link}`, {
					url: link,
					progress: `${currentProgress.totalProcessed + 1}/${linksToProcess.length}`,
				});
				const html = await fetchPage(link);
				const content = extractContent(html, link);

				// Skip very short content (probably not an article)
				if (content.wordCount < 50) {
					currentProgress.totalSkipped++;
					currentProgress.totalProcessed++;
					log(
						"debug",
						`Skip (too short: ${content.wordCount} words): ${link}`,
						{ url: link, wordCount: content.wordCount },
					);
					continue;
				}

				const contentHash = hashContent(content.text);

				// Save to DynamoDB
				const article = await saveArticle({
					url: link,
					title: content.title,
					source: source.name,
					fetchedAt: new Date().toISOString(),
					contentHash,
					s3Key: "", // not storing to S3 yet in MVP
					status: "fetched",
					qualityScore: undefined,
					metadata: {
						wordCount: content.wordCount,
						language: "en",
						author: content.author,
						publishedAt: content.publishedAt,
						tags: [],
					},
					dedupe: {
						isDuplicate: false,
					},
					ingestionRunId: undefined,
				});

				currentProgress.totalNew++;
				currentProgress.articles.push(article);
				log("info", `Saved: ${content.title} (${content.wordCount} words)`, {
					url: link,
					title: content.title,
					wordCount: content.wordCount,
					articleId: article.id,
				});
			} catch (err) {
				const msg = `Failed to process ${link}: ${err instanceof Error ? err.message : String(err)}`;
				currentProgress.errors.push(msg);
				log("error", msg, { url: link });
			}

			currentProgress.totalProcessed++;

			// Small delay to be respectful
			await new Promise((r) => setTimeout(r, 200));
		}

		currentProgress.status = "completed";
		currentProgress.completedAt = new Date().toISOString();
		log(
			"info",
			`Crawl completed. New: ${currentProgress.totalNew}, Skipped: ${currentProgress.totalSkipped}, Errors: ${currentProgress.errors.length}`,
			{
				totalNew: currentProgress.totalNew,
				totalSkipped: currentProgress.totalSkipped,
				errorCount: currentProgress.errors.length,
			},
		);
	} catch (err) {
		currentProgress.status = "failed";
		currentProgress.completedAt = new Date().toISOString();
		const msg = err instanceof Error ? err.message : "Unknown crawl error";
		currentProgress.errors.push(msg);
		log("error", `Fatal crawl error: ${msg}`, { error: msg });
	}
}
