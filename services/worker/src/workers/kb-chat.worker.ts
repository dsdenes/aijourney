import type { Job } from "bullmq";
import OpenAI from "openai";
import { getRateLimiter } from "@aijourney/shared";

const KB_BUILDER_URL =
	process.env.KB_BUILDER_URL || "http://localhost:3002";
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-5-mini";

/** Rate limiter for the chat model */
const rateLimiter = getRateLimiter(CHAT_MODEL, {
	logger: (msg) => console.log(msg),
});

const SYSTEM_PROMPT = `You are an AI knowledge assistant for a workplace AI adoption platform at mito.hu. You help employees learn about AI tools, techniques, and best practices.

You have access to a curated knowledge base of summarized articles. Use the provided context to answer questions accurately and helpfully.

Rules:
- Answer based on the provided context whenever possible
- If the context doesn't cover the question, say so honestly and provide general guidance
- Cite sources by mentioning the article title when referencing specific information
- Keep answers concise but thorough
- Use bullet points and formatting for readability`;

interface KBSummary {
	id: string;
	articleId: string;
	content: {
		title: string;
		keyPoints: string[];
		dos: string[];
		donts: string[];
		tags: string[];
		difficulty: string;
	};
}

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
	if (!openaiClient) {
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
		openaiClient = new OpenAI({ apiKey });
	}
	return openaiClient;
}

/**
 * KB Chat worker: fetches KB summaries for context, calls OpenAI to
 * generate an answer. This is the async/queued version of the chat
 * feature (the synchronous endpoint lives in the API service).
 */
export async function handleKbChatJob(
	job: Job,
): Promise<Record<string, unknown>> {
	const { runRequestId, userId, query } = job.data;
	const startedAt = Date.now();

	await job.log(`start run=${runRequestId} user=${userId}`);
	console.log(`[kb-chat] Processing run=${runRequestId} user=${userId}`);

	try {
		await job.updateProgress(10);

		// 1. Fetch KB summaries for context
		let summaries: KBSummary[] = [];
		try {
			const res = await fetch(`${KB_BUILDER_URL}/summaries`);
			if (res.ok) {
				const body = (await res.json()) as { data: KBSummary[] };
				summaries = body.data || [];
			}
		} catch {
			await job.log("KB Builder unavailable — proceeding without KB context");
		}

		await job.updateProgress(30);

		// 2. Select relevant summaries via keyword matching
		const queryWords = (query as string)
			.toLowerCase()
			.split(/\s+/)
			.filter((w: string) => w.length > 2);

		const scored = summaries.map((s) => {
			const text = [
				s.content.title,
				...s.content.keyPoints,
				...s.content.tags,
			]
				.join(" ")
				.toLowerCase();
			let score = 0;
			for (const w of queryWords) {
				if (text.includes(w)) score++;
				if (s.content.tags.some((t) => t.includes(w))) score += 2;
				if (s.content.title.toLowerCase().includes(w)) score += 3;
			}
			return { summary: s, score };
		});

		const relevant = scored
			.sort((a, b) => b.score - a.score)
			.slice(0, 8)
			.filter((s) => s.score > 0)
			.map((s) => s.summary);

		const contextSummaries =
			relevant.length > 0 ? relevant : summaries.slice(0, 5);

		const context =
			contextSummaries.length > 0
				? contextSummaries
						.map(
							(s, i) =>
								`--- Article ${i + 1}: ${s.content.title} ---\nTags: ${s.content.tags.join(", ")}\nKey Points:\n${s.content.keyPoints.map((p) => `  • ${p}`).join("\n")}\nDo: ${s.content.dos.join("; ")}\nDon't: ${s.content.donts.join("; ")}`,
						)
						.join("\n\n")
				: "No relevant articles found in the knowledge base.";

		await job.updateProgress(50);

		// 3. Call OpenAI (with rate limiting)
		const openai = getOpenAI();
		const contextMsg = `Context from knowledge base:\n\n${context}`;
		const estimatedTokens = Math.ceil((SYSTEM_PROMPT.length + contextMsg.length + (query as string).length) / 4) + 1500;
		await rateLimiter.waitForCapacity(estimatedTokens);
		rateLimiter.recordRequest(estimatedTokens);

		const completion = await openai.chat.completions.create({
			model: CHAT_MODEL,
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "system", content: contextMsg },
				{ role: "user", content: query as string },
			],
			max_tokens: 1500,
			temperature: 0.5,
		});

		const answer =
			completion.choices[0]?.message?.content ||
			"Sorry, I could not generate a response.";
		const tokensUsed = completion.usage?.total_tokens ?? 0;
		if (tokensUsed > 0) {
			rateLimiter.recordUsage(Math.max(0, tokensUsed - estimatedTokens));
		}

		await job.updateProgress(100);
		await job.log(
			`completed run=${runRequestId} tokens=${tokensUsed} sources=${contextSummaries.length}`,
		);
		console.log(
			`[kb-chat] Done run=${runRequestId} tokens=${tokensUsed}`,
		);

		return {
			runRequestId,
			userId,
			query,
			answer,
			tokensUsed,
			model: CHAT_MODEL,
			sourcesCount: contextSummaries.length,
			status: "completed",
			durationMs: Date.now() - startedAt,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await job.log(`FAILED: ${msg}`);
		console.error(`[kb-chat] Failed run=${runRequestId}: ${msg}`);
		throw err;
	}
}
