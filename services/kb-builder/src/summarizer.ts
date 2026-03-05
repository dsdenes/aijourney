import type { Article, SummaryContent } from '@aijourney/shared';
import { getRateLimiter } from '@aijourney/shared';
import OpenAI from 'openai';
import { completeAgentRun, failAgentRun, startAgentRun } from './agent-run-logger.js';
import { getArticleById, getArticlesByStatus, updateArticleStatus } from './article-repository.js';
import { log } from './log-stream.js';
import { getSummaryByArticleId, saveSummary } from './summary-repository.js';

const OPENAI_MODEL = process.env.OPENAI_SUMMARIZATION_MODEL || 'gpt-5-nano';
const PROMPT_VERSION = 'v1';

/** Maximum article text length (characters) sent to OpenAI */
const MAX_ARTICLE_LENGTH = 12_000;

/** Maximum number of retry attempts for transient OpenAI failures */
const MAX_RETRIES = 3;
/** Initial backoff delay in ms (doubles each retry) */
const INITIAL_BACKOFF_MS = 2_000;

/** Rate limiter for the summarization model */
const rateLimiter = getRateLimiter(OPENAI_MODEL, {
  logger: (msg) => log('warn', msg),
});

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new SummarizerConfigError('OPENAI_API_KEY environment variable is not set');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

class SummarizerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SummarizerConfigError';
  }
}

class SummarizationError extends Error {
  constructor(
    public readonly articleId: string,
    message: string,
  ) {
    super(message);
    this.name = 'SummarizationError';
  }
}

const SYSTEM_PROMPT = `You are an AI knowledge curator for a workplace AI adoption platform at mito.hu (a Hungarian digital agency). Your task is to create a structured summary of an article about AI practices, tools, or concepts.

Output a JSON object with this exact schema:
{
  "title": "concise descriptive title (max 80 chars)",
  "keyPoints": ["point 1", "point 2", ...],
  "dos": ["best practice 1", ...],
  "donts": ["anti-pattern 1", ...],
  "tags": ["tag1", "tag2"],
  "difficulty": "beginner|intermediate|advanced",
  "roleRelevance": [
    {"role": "engineering", "relevanceScore": 0.0-1.0},
    {"role": "pm", "relevanceScore": 0.0-1.0},
    {"role": "design", "relevanceScore": 0.0-1.0},
    {"role": "hr", "relevanceScore": 0.0-1.0},
    {"role": "finance", "relevanceScore": 0.0-1.0},
    {"role": "sales", "relevanceScore": 0.0-1.0}
  ],
  "citations": [
    {"text": "quoted text from article", "sourceSection": "section heading or paragraph ref"}
  ],
  "relevanceScore": 0.0-1.0,
  "relevanceReason": "Brief explanation"
}

Rules:
- keyPoints: 3-7 key takeaways, each a single clear sentence
- dos: 1-5 actionable best practices from the article
- donts: 1-5 anti-patterns or things to avoid mentioned in the article
- tags: 1-5 from this taxonomy ONLY: prompt-engineering, code-generation, document-generation, data-analysis, process-automation, critical-evaluation, information-synthesis, tools, strategy, ethics, security, productivity
- difficulty: based on technical depth and required background knowledge
- roleRelevance: score 0.0-1.0 for each role based on article applicability
- citations: 1-3 direct quotes from the article that support key points
- relevanceScore: 0.0-1.0 how relevant this article is for a workplace AI adoption knowledge base. Score 0.8+ for directly actionable AI practices, 0.5-0.8 for tangentially related content, below 0.5 for irrelevant (personal opinions, unrelated tech news, purely theoretical ML research with no workplace application)
- relevanceReason: 1-2 sentences explaining the relevance score

Output ONLY the JSON object, no markdown fences or extra text.`;

export interface SummarizationResult {
  summarized: number;
  skipped: number;
  errors: string[];
  totalTokensUsed: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
}

/**
 * Determine if an error is transient and worth retrying.
 */
function isRetryableError(err: unknown): boolean {
  if (err instanceof SummarizationError && err.message.includes('Empty response')) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    // OpenAI rate limits, server errors, timeouts, connection resets
    if (msg.includes('429') || msg.includes('rate limit')) return true;
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504'))
      return true;
    if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('econnrefused'))
      return true;
    if (msg.includes('server error') || msg.includes('internal error')) return true;
  }
  return false;
}

/**
 * Call OpenAI chat completion with retry + exponential backoff for transient failures.
 * Integrates with the rate limiter to stay within RPM/TPM limits.
 */
async function callOpenAIWithRetry(
  openai: OpenAI,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  articleId: string,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  let lastError: unknown;

  // Estimate tokens: ~4 chars per token for English, system+user prompts
  const estimatedTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4) + 2000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Wait for rate limiter capacity before making the call
      const waited = await rateLimiter.waitForCapacity(estimatedTokens);
      if (waited > 0) {
        log('info', `Rate limiter waited ${waited}ms before OpenAI call for ${articleId}`, {
          articleId,
          waited,
        });
      }
      rateLimiter.recordRequest(estimatedTokens);

      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 2000,
      });

      // Record actual token usage (replace the estimate)
      const actualTokens = completion.usage?.total_tokens ?? 0;
      if (actualTokens > 0) {
        // Adjust: the pre-recorded estimate vs actual
        rateLimiter.recordUsage(Math.max(0, actualTokens - estimatedTokens));
      }

      // Check for empty response — treat as retryable
      if (!completion.choices[0]?.message?.content) {
        const emptyErr = new SummarizationError(articleId, 'Empty response from OpenAI');
        if (attempt < MAX_RETRIES) {
          const backoff = INITIAL_BACKOFF_MS * 2 ** (attempt - 1);
          log(
            'warn',
            `Empty OpenAI response for ${articleId}, retrying in ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`,
            { articleId, attempt },
          );
          await new Promise((r) => setTimeout(r, backoff));
          lastError = emptyErr;
          continue;
        }
        throw emptyErr;
      }

      if (attempt > 1) {
        log('info', `OpenAI call succeeded on retry attempt ${attempt} for ${articleId}`, {
          articleId,
          attempt,
        });
      }

      return completion;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        const backoff = INITIAL_BACKOFF_MS * 2 ** (attempt - 1);
        log(
          'warn',
          `OpenAI call failed for ${articleId} (attempt ${attempt}/${MAX_RETRIES}), retrying in ${backoff}ms: ${err instanceof Error ? err.message : String(err)}`,
          { articleId, attempt },
        );
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }

  // Should not reach here, but type-safety
  throw lastError;
}

/**
 * Summarize a single article using OpenAI.
 * Returns the token count used.
 */
async function summarizeArticle(
  article: Article,
  articleText: string,
): Promise<{
  tokensUsed: number;
  promptTokens: number;
  completionTokens: number;
}> {
  const startTime = Date.now();

  // Build full input for agent run logging (mirrors what summarizeArticleInternal constructs)
  const truncatedText =
    articleText.length > MAX_ARTICLE_LENGTH
      ? articleText.slice(0, MAX_ARTICLE_LENGTH) + '\n\n[...article truncated]'
      : articleText;
  const userPromptForLog = `Summarize the following article:\n\nTitle: ${article.title}\nSource: ${article.url}\n\n---\n${truncatedText}\n---`;
  const fullInput = JSON.stringify([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPromptForLog },
  ]);

  const agentRun = await startAgentRun({
    agent: 'summarizer',
    input: `${article.title.slice(0, 150)} (${article.url})`,
    model: OPENAI_MODEL,
    fullInput,
    metadata: { articleId: article.id, textLength: articleText.length },
  });

  try {
    const result = await summarizeArticleInternal(article, articleText);
    const durationMs = Date.now() - startTime;

    await completeAgentRun(agentRun.id, {
      output: `Summarized: ${article.title.slice(0, 100)} (${result.tokensUsed} tokens)`,
      fullOutput: result.fullOutput,
      tokensUsed: result.tokensUsed,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      durationMs,
      metadata: { articleId: article.id },
    });

    return result;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await failAgentRun(agentRun.id, err instanceof Error ? err.message : String(err), durationMs);
    throw err;
  }
}

/**
 * Internal implementation of article summarization.
 */
async function summarizeArticleInternal(
  article: Article,
  articleText: string,
): Promise<{
  tokensUsed: number;
  promptTokens: number;
  completionTokens: number;
  fullInput: string;
  fullOutput: string;
}> {
  const openai = getOpenAI();

  // Truncate very long articles
  const text =
    articleText.length > MAX_ARTICLE_LENGTH
      ? articleText.slice(0, MAX_ARTICLE_LENGTH) + '\n\n[...article truncated]'
      : articleText;

  const userPrompt = `Summarize the following article:\n\nTitle: ${article.title}\nSource: ${article.url}\n\n---\n${text}\n---`;

  log('info', `Summarizing: ${article.title.slice(0, 60)}`, {
    articleId: article.id,
    model: OPENAI_MODEL,
    textLength: text.length,
  });

  const completion = await callOpenAIWithRetry(
    openai,
    OPENAI_MODEL,
    SYSTEM_PROMPT,
    userPrompt,
    article.id,
  );

  const choice = completion.choices[0];
  if (!choice?.message?.content) {
    throw new SummarizationError(article.id, 'Empty response from OpenAI after all retries');
  }

  const tokensUsed = completion.usage?.total_tokens ?? 0;
  const promptTokens = completion.usage?.prompt_tokens ?? 0;
  const completionTokens = completion.usage?.completion_tokens ?? 0;

  // Capture full I/O for agent run logging
  const fullInput = JSON.stringify([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]);
  const fullOutput = choice.message.content;

  // Parse and validate the response
  let parsed: SummaryContent;
  try {
    parsed = JSON.parse(choice.message.content) as SummaryContent;
  } catch {
    throw new SummarizationError(
      article.id,
      `Invalid JSON in OpenAI response: ${choice.message.content.slice(0, 200)}`,
    );
  }

  // Basic validation
  if (!parsed.title || !parsed.keyPoints?.length || !parsed.tags?.length) {
    throw new SummarizationError(article.id, `Incomplete summary: missing title/keyPoints/tags`);
  }

  // Save summary to MongoDB
  const summary = await saveSummary({
    articleId: article.id,
    runRequestId: '', // MVP: no run request tracking yet
    version: 1,
    content: parsed,
    model: OPENAI_MODEL,
    promptVersion: PROMPT_VERSION,
    tokensUsed,
    promptTokens,
    completionTokens,
  });

  // Update article status
  await updateArticleStatus(article.id, 'summarized');

  log(
    'info',
    `Summarized: ${parsed.title} (${tokensUsed} tokens [${promptTokens} in / ${completionTokens} out])`,
    {
      articleId: article.id,
      summaryId: summary.id,
      tokensUsed,
      promptTokens,
      completionTokens,
      tags: parsed.tags,
      difficulty: parsed.difficulty,
    },
  );

  return { tokensUsed, promptTokens, completionTokens, fullInput, fullOutput };
}

/**
 * Run summarization on articles with status "quality_passed".
 * Calls OpenAI for each article and stores structured summaries.
 * @param limit Max number of articles to summarize (0 = unlimited)
 */
export async function runSummarization(limit = 0): Promise<SummarizationResult> {
  let articles = await getArticlesByStatus('quality_passed');
  if (limit > 0) {
    articles = articles.slice(0, limit);
  }
  const result: SummarizationResult = {
    summarized: 0,
    skipped: 0,
    errors: [],
    totalTokensUsed: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
  };

  log('info', `Summarization: processing ${articles.length} quality-passed articles`, {
    count: articles.length,
    model: OPENAI_MODEL,
  });

  if (articles.length === 0) {
    log('info', 'Summarization: no articles to process');
    return result;
  }

  // Check OpenAI key is present before starting
  try {
    getOpenAI();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', `Summarization aborted: ${msg}`);
    result.errors.push(msg);
    return result;
  }

  for (const article of articles) {
    try {
      // Skip if already has a summary (idempotent)
      const existingSummary = await getSummaryByArticleId(article.id);
      if (existingSummary) {
        result.skipped++;
        await updateArticleStatus(article.id, 'summarized');
        log('debug', `Skip (already summarized): ${article.title.slice(0, 60)}`, {
          articleId: article.id,
        });
        continue;
      }

      // We need the article text. For MVP, re-fetch the page content.
      // In production, this would come from S3.
      const fullArticle = await getArticleById(article.id);
      if (!fullArticle) {
        result.errors.push(`Article ${article.id} not found`);
        continue;
      }

      // Re-fetch the page to get text (MVP: we don't store raw text in S3 yet)
      const { extractArticleText } = await import('./crawler.js');
      const text = await extractArticleText(article.url);
      if (!text || text.length < 100) {
        result.errors.push(`Article ${article.id}: insufficient text for summarization`);
        await updateArticleStatus(article.id, 'quality_failed');
        continue;
      }

      const { tokensUsed, promptTokens, completionTokens } = await summarizeArticle(article, text);
      result.summarized++;
      result.totalTokensUsed += tokensUsed;
      result.totalPromptTokens += promptTokens;
      result.totalCompletionTokens += completionTokens;

      // Rate limiting is handled by the rateLimiter in callOpenAIWithRetry
    } catch (err) {
      const msg = `Summarization failed for ${article.id} (${article.title.slice(0, 40)}): ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      log('error', msg, { articleId: article.id });
    }
  }

  log(
    'info',
    `Summarization complete: ${result.summarized} summarized, ${result.skipped} skipped, ${result.errors.length} errors, ${result.totalTokensUsed} total tokens`,
    {
      summarized: result.summarized,
      skipped: result.skipped,
      errors: result.errors.length,
      totalTokensUsed: result.totalTokensUsed,
    },
  );

  return result;
}
