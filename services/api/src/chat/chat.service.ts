import { getRateLimiter } from "@aijourney/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { AgentRunsService } from "../agent-runs/agent-runs.service";
import { AppConfigService } from "../config/config.service";

interface SummaryContent {
	title: string;
	keyPoints: string[];
	dos: string[];
	donts: string[];
	tags: string[];
	difficulty: string;
	roleRelevance: { role: string; relevanceScore: number }[];
	citations: { text: string; sourceSection: string }[];
}

interface KBSummary {
	id: string;
	articleId: string;
	content: SummaryContent;
	model: string;
	createdAt: string;
}

interface KBArticle {
	id: string;
	url: string;
	title: string;
	source: string;
	status: string;
}

interface RagChunk {
	text: string;
	score: number;
	metadata: {
		doc_id: string;
		chunk_index: number;
		article_url: string;
		article_title: string;
		article_source: string;
		summary_title: string;
		tags: string[];
		difficulty: string;
	};
}

interface RagSearchResult {
	chunks: RagChunk[];
	tokensUsed: number;
	rawResponse?: unknown;
	searchTimeMs?: number;
}

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

export interface ChatResponse {
	answer: string;
	sources: { title: string; url: string; relevance: string }[];
	tokensUsed: number;
	promptTokens?: number;
	completionTokens?: number;
	model: string;
	/** Full messages array sent to OpenAI (JSON) */
	fullInput?: string;
	/** Full raw response from OpenAI */
	fullOutput?: string;
	/** Step-by-step technical details on how the answer was produced */
	technicalSteps?: string[];
}

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-5-mini";

const SYSTEM_PROMPT = `You are an AI knowledge assistant for a workplace AI adoption platform. You help users learn about AI tools, techniques, and best practices.

You have access to a curated knowledge base of summarized articles. Use the provided context to answer questions accurately and helpfully.

Rules:
- Answer based on the provided context whenever possible
- If the context doesn't cover the question, say so honestly and provide general guidance
- Cite sources by mentioning the article title when referencing specific information
- Keep answers concise but thorough
- **Format your response in Markdown** — use headings, bullet points, bold, code blocks, and other Markdown formatting for readability
- If asked about specific tools, mention practical dos and don'ts from the knowledge base`;

@Injectable()
export class ChatService {
	private readonly logger = new Logger(ChatService.name);
	private openai: OpenAI | null = null;
	private readonly rateLimiter = getRateLimiter(CHAT_MODEL, {
		logger: (msg) => this.logger.warn(msg),
	});

	constructor(
		@Inject(AppConfigService) private readonly configService: AppConfigService,
		@Inject(AgentRunsService) private readonly agentRunsService: AgentRunsService,
	) {}

	private getOpenAI(): OpenAI {
		if (!this.openai) {
			const apiKey = process.env.OPENAI_API_KEY;
			if (!apiKey) {
				throw new Error("OPENAI_API_KEY environment variable is not set");
			}
			this.openai = new OpenAI({ apiKey });
		}
		return this.openai;
	}

	/**
	 * Fetch all summaries from the KB Builder service.
	 */
	private async fetchSummaries(): Promise<KBSummary[]> {
		try {
			const res = await fetch(
				`${this.configService.config.KB_BUILDER_URL}/summaries`,
			);
			if (!res.ok) return [];
			const data = (await res.json()) as { data: KBSummary[] };
			return data.data || [];
		} catch {
			this.logger.warn(
				"KB Builder service unavailable — no summaries for context",
			);
			return [];
		}
	}

	/**
	 * Fetch all articles from the KB Builder service.
	 */
	private async fetchArticles(): Promise<KBArticle[]> {
		try {
			const res = await fetch(
				`${this.configService.config.KB_BUILDER_URL}/articles`,
			);
			if (!res.ok) return [];
			const data = (await res.json()) as { data: KBArticle[] };
			return data.data || [];
		} catch {
			return [];
		}
	}

	/**
	 * Simple keyword-based relevance scoring to select top summaries for context.
	 */
	private selectRelevantSummaries(
		query: string,
		summaries: KBSummary[],
		maxResults = 8,
	): KBSummary[] {
		const queryWords = query
			.toLowerCase()
			.split(/\s+/)
			.filter((w) => w.length > 2);

		const scored = summaries.map((s) => {
			const content = s.content;
			const searchText = [
				content.title,
				...content.keyPoints,
				...content.dos,
				...content.donts,
				...content.tags,
			]
				.join(" ")
				.toLowerCase();

			let score = 0;
			for (const word of queryWords) {
				if (searchText.includes(word)) score++;
				// Boost tag matches
				if (content.tags.some((t) => t.includes(word))) score += 2;
				// Boost title matches
				if (content.title.toLowerCase().includes(word)) score += 3;
			}
			return { summary: s, score };
		});

		// Sort by score, take top results
		return scored
			.sort((a, b) => b.score - a.score)
			.slice(0, maxResults)
			.filter((s) => s.score > 0)
			.map((s) => s.summary);
	}

	/**
	 * Format summaries as context for the LLM prompt.
	 */
	private formatContext(summaries: KBSummary[], articles: KBArticle[]): string {
		if (summaries.length === 0) {
			return "No relevant articles found in the knowledge base.";
		}

		const articleMap = new Map(articles.map((a) => [a.id, a]));

		return summaries
			.map((s, i) => {
				const article = articleMap.get(s.articleId);
				const url = article?.url || "unknown";
				const source = article?.source || "unknown";
				const c = s.content;

				return `--- Article ${i + 1}: ${c.title} ---
Source: ${source} (${url})
Tags: ${c.tags.join(", ")}
Difficulty: ${c.difficulty}
Key Points:
${c.keyPoints.map((p) => `  • ${p}`).join("\n")}
Best Practices:
${c.dos.map((d) => `  ✓ ${d}`).join("\n")}
Anti-Patterns:
${c.donts.map((d) => `  ✗ ${d}`).join("\n")}`;
			})
			.join("\n\n");
	}

	/**
	 * Search the Pinecone RAG for relevant chunks via kb-builder.
	 */
	private async searchRag(query: string): Promise<{
		context: string;
		sources: { title: string; url: string; relevance: string }[];
		embeddingTokens: number;
		rawResponse?: unknown;
		searchTimeMs?: number;
	}> {
		try {
			const res = await fetch(
				`${this.configService.config.KB_BUILDER_URL}/rag/query`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ query, topK: 8, scoreThreshold: 0.3 }),
				},
			);
			if (!res.ok) {
				this.logger.warn(
					`RAG query returned ${res.status} — falling back to keyword search`,
				);
				return { context: "", sources: [], embeddingTokens: 0 };
			}

			const data = (await res.json()) as { data: RagSearchResult };
			const result = data.data;

			if (!result.chunks || result.chunks.length === 0) {
				return {
					context: "No relevant information found in the knowledge base.",
					sources: [],
					embeddingTokens: result.tokensUsed,
					rawResponse: result.rawResponse,
					searchTimeMs: result.searchTimeMs,
				};
			}

			// Group chunks by article and format as context
			const context = result.chunks
				.map((chunk, i) => {
					return `--- Chunk ${i + 1} (relevance: ${(chunk.score * 100).toFixed(0)}%) ---
Title: ${chunk.metadata.summary_title || chunk.metadata.article_title}
Source: ${chunk.metadata.article_source} (${chunk.metadata.article_url})
Tags: ${chunk.metadata.tags.join(", ")}
Difficulty: ${chunk.metadata.difficulty}

${chunk.text}`;
				})
				.join("\n\n");

			// Deduplicate sources by URL
			const seenUrls = new Set<string>();
			const sources: { title: string; url: string; relevance: string }[] = [];
			for (const chunk of result.chunks) {
				const url = chunk.metadata.article_url;
				if (url && !seenUrls.has(url)) {
					seenUrls.add(url);
					sources.push({
						title: chunk.metadata.summary_title || chunk.metadata.article_title,
						url,
						relevance: chunk.metadata.tags.join(", "),
					});
				}
			}

			return {
				context,
				sources,
				embeddingTokens: result.tokensUsed,
				rawResponse: result.rawResponse,
				searchTimeMs: result.searchTimeMs,
			};
		} catch (err) {
			this.logger.warn(
				`RAG query failed: ${err instanceof Error ? err.message : String(err)} — falling back to keyword search`,
			);
			return { context: "", sources: [], embeddingTokens: 0 };
		}
	}

	/**
	 * Handle a chat query: retrieve context from KB, call OpenAI, return answer.
	 */
	async chat(
		query: string,
		conversationHistory: ChatMessage[] = [],
	): Promise<ChatResponse> {
		const startTime = Date.now();
		const agentRun = await this.agentRunsService.startRun({
			agent: "chat",
			input: query.length > 200 ? query.slice(0, 200) + "…" : query,
			model: CHAT_MODEL,
			metadata: {
				ragProvider: "pinecone",
				historyLength: conversationHistory.length,
			},
		});

		try {
			const result = await this.chatInternal(query, conversationHistory);
			const durationMs = Date.now() - startTime;

			await this.agentRunsService.completeRun(agentRun.id, {
				output:
					result.answer.length > 300
						? result.answer.slice(0, 300) + "…"
						: result.answer,
				fullInput: result.fullInput,
				fullOutput: result.fullOutput,
				tokensUsed: result.tokensUsed,
				promptTokens: result.promptTokens,
				completionTokens: result.completionTokens,
				durationMs,
				metadata: {
					sourcesCount: result.sources.length,
					sources: result.sources.map((s) => s.title),
				},
			});

			return result;
		} catch (err) {
			const durationMs = Date.now() - startTime;
			await this.agentRunsService.failRun(
				agentRun.id,
				err instanceof Error ? err.message : String(err),
				durationMs,
			);
			throw err;
		}
	}

	/**
	 * Internal chat implementation.
	 */
	private async chatInternal(
		query: string,
		conversationHistory: ChatMessage[] = [],
	): Promise<ChatResponse> {
		const openai = this.getOpenAI();
		const technicalSteps: string[] = [];
		const totalStart = Date.now();

		let context: string;
		let sources: { title: string; url: string; relevance: string }[];
		let embeddingTokens = 0;

		technicalSteps.push(
			"RAG provider: Pinecone (searchRecords with integrated multilingual-e5-large)",
		);
		technicalSteps.push(`RAG query: "${query.slice(0, 120)}"`);

		// Semantic search via Pinecone
		this.logger.log(`Using Pinecone RAG for query: "${query.slice(0, 60)}"`);
		const ragStart = Date.now();
		const ragResult = await this.searchRag(query);
		const ragElapsed = Date.now() - ragStart;
		context = ragResult.context;
		sources = ragResult.sources;
		embeddingTokens = ragResult.embeddingTokens;

		technicalSteps.push(
			`Pinecone searchRecords completed in ${ragResult.searchTimeMs ?? ragElapsed}ms (total RAG call: ${ragElapsed}ms)`,
		);

		if (ragResult.rawResponse) {
			technicalSteps.push(
				`RAG raw response: ${JSON.stringify(ragResult.rawResponse)}`,
			);
		}

		if (!context || context.includes("No relevant information")) {
			technicalSteps.push(
				"Pinecone returned no relevant chunks — falling back to keyword search over KB summaries",
			);
			const kwStart = Date.now();
			const fallback = await this.keywordSearch(query);
			const kwElapsed = Date.now() - kwStart;
			context = fallback.context;
			sources = fallback.sources;
			technicalSteps.push(
				`Keyword search found ${sources.length} relevant sources (${kwElapsed}ms)`,
			);
		} else {
			technicalSteps.push(
				`Pinecone returned ${sources.length} relevant sources from RAG chunks`,
			);
		}

		technicalSteps.push(
			`Including ${conversationHistory.length} previous messages as conversation context (max 10)`,
		);

		// Build messages
		const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
			{ role: "system", content: SYSTEM_PROMPT },
			{
				role: "system",
				content: `Here is relevant context from the knowledge base:\n\n${context}`,
			},
		];

		// Add conversation history (last 10 messages)
		for (const msg of conversationHistory.slice(-10)) {
			messages.push({ role: msg.role, content: msg.content });
		}

		// Add current query
		messages.push({ role: "user", content: query });

		this.logger.log(
			`Chat query: "${query.slice(0, 60)}" with ${sources.length} sources [pinecone]`,
		);

		// Rate limit: estimate tokens from message payload + max completion
		const estimatedTokens =
			Math.ceil(
				messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0) / 4,
			) + 4000;
		await this.rateLimiter.waitForCapacity(estimatedTokens);
		this.rateLimiter.recordRequest(estimatedTokens);

		const llmStart = Date.now();
		const completion = await openai.chat.completions.create({
			model: CHAT_MODEL,
			messages,
			max_completion_tokens: 4000,
		});
		const llmElapsed = Date.now() - llmStart;

		const choice = completion.choices[0];
		const answer =
			choice?.message?.content || "Sorry, I could not generate a response.";
		const tokensUsed = (completion.usage?.total_tokens ?? 0) + embeddingTokens;
		const promptTokens =
			(completion.usage?.prompt_tokens ?? 0) + embeddingTokens;
		const completionTokens = completion.usage?.completion_tokens ?? 0;

		// Record actual usage
		if (completion.usage?.total_tokens) {
			this.rateLimiter.recordUsage(
				Math.max(0, completion.usage.total_tokens - estimatedTokens),
			);
		}

		const totalElapsed = Date.now() - totalStart;

		this.logger.log(
			`Chat response: ${tokensUsed} tokens (${promptTokens} in / ${completionTokens} out), ${sources.length} sources [pinecone] (${totalElapsed}ms)`,
		);

		technicalSteps.push(`OpenAI ${CHAT_MODEL} responded in ${llmElapsed}ms`);
		technicalSteps.push(
			`Tokens — prompt: ${promptTokens.toLocaleString()}, completion: ${completionTokens.toLocaleString()}, total: ${tokensUsed.toLocaleString()}`,
		);
		technicalSteps.push(`Total elapsed: ${totalElapsed}ms`);

		return {
			answer,
			sources,
			tokensUsed,
			promptTokens,
			completionTokens,
			model: CHAT_MODEL,
			fullInput: JSON.stringify(messages),
			fullOutput: answer,
			technicalSteps,
		};
	}

	/**
	 * Legacy keyword-based context retrieval over KB summaries.
	 */
	private async keywordSearch(query: string): Promise<{
		context: string;
		sources: { title: string; url: string; relevance: string }[];
	}> {
		const [summaries, articles] = await Promise.all([
			this.fetchSummaries(),
			this.fetchArticles(),
		]);

		const relevant =
			summaries.length > 0
				? this.selectRelevantSummaries(query, summaries)
				: [];

		const contextSummaries =
			relevant.length > 0 ? relevant : summaries.slice(0, 5);

		const context = this.formatContext(contextSummaries, articles);

		const articleMap = new Map(articles.map((a) => [a.id, a]));
		const sources = contextSummaries.map((s) => {
			const article = articleMap.get(s.articleId);
			return {
				title: s.content.title,
				url: article?.url || "",
				relevance: s.content.tags.join(", "),
			};
		});

		return { context, sources };
	}
}
