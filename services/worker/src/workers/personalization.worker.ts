import type { Job } from "bullmq";
import OpenAI from "openai";
import { getRateLimiter } from "@aijourney/shared";

const KB_BUILDER_URL =
	process.env.KB_BUILDER_URL || "http://localhost:3002";
const API_URL = process.env.API_URL || "http://localhost:3000";
const PERSONALIZATION_MODEL =
	process.env.OPENAI_PERSONALIZATION_MODEL || "gpt-5-mini";

/** Rate limiter for the personalization model */
const rateLimiter = getRateLimiter(PERSONALIZATION_MODEL, {
	logger: (msg) => console.log(msg),
});

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
		roleRelevance: { role: string; relevanceScore: number }[];
	};
}

interface JourneyData {
	id: string;
	title: string;
	description: string;
	currentLevel: string;
	competencyAreas: string[];
	metadata: {
		estimatedDurationWeeks: number;
		difficultyProgression: string;
		roleCategory: string;
	};
}

interface UserData {
	id: string;
	name: string;
	role: string;
	department?: string;
	jobTitle?: string;
	preferences: {
		tools?: string[];
		workflows?: string[];
		comfortLevel?: string;
		goals?: string[];
	};
}

const SYSTEM_PROMPT = `You are an AI learning path designer for a workplace AI adoption platform. Your task is to generate personalized learning steps for a user's AI journey.

You have access to the user's profile, their journey details, and a curated knowledge base of AI articles. Generate concrete, actionable learning steps that match the user's level and role.

Output a JSON array of step objects with this schema:
[
  {
    "title": "step title (max 80 chars)",
    "description": "what the user will learn",
    "task": "concrete task the user must complete",
    "expectedOutput": "what a successful completion looks like",
    "estimatedMinutes": 30,
    "tags": ["tag1", "tag2"],
    "toolsRequired": ["tool1"]
  }
]

Rules:
- Generate 5-8 steps
- Steps should progress from simpler to more complex
- Each task should be concrete and completable in 15-90 minutes
- Tags should match the taxonomy: prompt-engineering, code-generation, document-generation, data-analysis, process-automation, critical-evaluation, information-synthesis, tools, strategy
- Reference specific tools and techniques from the knowledge base context
- Tailor difficulty and examples to the user's role/department

Output ONLY the JSON array, no markdown fences or extra text.`;

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
 * Personalization worker: fetches user profile + journey info, retrieves
 * relevant KB summaries, and calls OpenAI to generate personalized
 * learning steps for a journey.
 */
export async function handlePersonalizationJob(
	job: Job,
): Promise<Record<string, unknown>> {
	const { runRequestId, userId, journeyId } = job.data;
	const startedAt = Date.now();

	await job.log(
		`start run=${runRequestId} user=${userId} journey=${journeyId}`,
	);
	console.log(
		`[personalization] Processing run=${runRequestId} user=${userId} journey=${journeyId}`,
	);

	try {
		await job.updateProgress(10);

		// 1. Fetch user profile from API
		let user: UserData | null = null;
		try {
			const res = await fetch(`${API_URL}/users/${userId}`);
			if (res.ok) {
				const body = (await res.json()) as { data: UserData };
				user = body.data;
			}
		} catch {
			await job.log("Could not fetch user profile — using defaults");
		}

		// 2. Fetch journey from API
		let journey: JourneyData | null = null;
		try {
			const res = await fetch(`${API_URL}/journeys/${journeyId}`);
			if (res.ok) {
				const body = (await res.json()) as { data: JourneyData };
				journey = body.data;
			}
		} catch {
			await job.log("Could not fetch journey — using defaults");
		}

		await job.updateProgress(30);

		// 3. Fetch KB summaries for context
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

		// Filter summaries by role relevance if user data is available
		const userRole = (user?.role || "employee").toLowerCase();
		const roleSummaries = summaries
			.map((s) => {
				const relevance = s.content.roleRelevance?.find(
					(r) => r.role.toLowerCase() === userRole,
				);
				return { summary: s, score: relevance?.relevanceScore || 0.3 };
			})
			.sort((a, b) => b.score - a.score)
			.slice(0, 10)
			.map((s) => s.summary);

		await job.updateProgress(50);

		// 4. Build context
		const kbContext =
			roleSummaries.length > 0
				? roleSummaries
						.map(
							(s, i) =>
								`Article ${i + 1}: ${s.content.title}\nDifficulty: ${s.content.difficulty}\nTags: ${s.content.tags.join(", ")}\nKey Points: ${s.content.keyPoints.join("; ")}\nDo: ${s.content.dos.join("; ")}\nDon't: ${s.content.donts.join("; ")}`,
						)
						.join("\n\n")
				: "No knowledge base articles available.";

		const userContext = user
			? `User: ${user.name}\nRole: ${user.role}\nDepartment: ${user.department || "unknown"}\nJob: ${user.jobTitle || "unknown"}\nComfort Level: ${user.preferences?.comfortLevel || "beginner"}\nGoals: ${user.preferences?.goals?.join(", ") || "general AI adoption"}\nPreferred Tools: ${user.preferences?.tools?.join(", ") || "none specified"}`
			: `User ID: ${userId} (profile not available)`;

		const journeyContext = journey
			? `Journey: ${journey.title}\nDescription: ${journey.description}\nLevel: ${journey.currentLevel}\nCompetency Areas: ${journey.competencyAreas.join(", ")}\nRole Category: ${journey.metadata.roleCategory}\nDifficulty: ${journey.metadata.difficultyProgression}`
			: `Journey ID: ${journeyId} (details not available)`;

		// 5. Call OpenAI (with rate limiting)
		const openai = getOpenAI();
		const userMessage = `${userContext}\n\n${journeyContext}\n\nKnowledge Base Articles:\n${kbContext}\n\nGenerate personalized learning steps for this user's AI journey.`;
		const estimatedTokens = Math.ceil((SYSTEM_PROMPT.length + userMessage.length) / 4) + 3000;
		await rateLimiter.waitForCapacity(estimatedTokens);
		rateLimiter.recordRequest(estimatedTokens);

		const completion = await openai.chat.completions.create({
			model: PERSONALIZATION_MODEL,
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: userMessage },
			],
			response_format: { type: "json_object" },
			max_tokens: 3000,
			temperature: 0.5,
		});

		const content = completion.choices[0]?.message?.content;
		if (!content) throw new Error("Empty response from OpenAI");

		const tokensUsed = completion.usage?.total_tokens ?? 0;
		if (tokensUsed > 0) {
			rateLimiter.recordUsage(Math.max(0, tokensUsed - estimatedTokens));
		}

		// 6. Parse generated steps
		let steps: Record<string, unknown>[];
		try {
			const parsed = JSON.parse(content);
			// Handle both { steps: [...] } and direct [...] formats
			steps = Array.isArray(parsed)
				? parsed
				: Array.isArray(parsed.steps)
					? parsed.steps
					: [];
		} catch {
			throw new Error(
				`Invalid JSON in OpenAI response: ${content.slice(0, 200)}`,
			);
		}

		if (steps.length === 0) {
			throw new Error("OpenAI returned empty steps array");
		}

		await job.updateProgress(90);
		await job.log(
			`Generated ${steps.length} personalized steps (${tokensUsed} tokens)`,
		);

		await job.updateProgress(100);
		await job.log(`completed run=${runRequestId}`);
		console.log(
			`[personalization] Done run=${runRequestId} steps=${steps.length} tokens=${tokensUsed}`,
		);

		return {
			runRequestId,
			userId,
			journeyId,
			stepsGenerated: steps.length,
			steps,
			tokensUsed,
			model: PERSONALIZATION_MODEL,
			status: "completed",
			durationMs: Date.now() - startedAt,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await job.log(`FAILED: ${msg}`);
		console.error(
			`[personalization] Failed run=${runRequestId}: ${msg}`,
		);
		throw err;
	}
}
