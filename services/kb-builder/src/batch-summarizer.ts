/**
 * OpenAI Batch API summarizer — 50% cheaper than synchronous API.
 *
 * Flow:
 *   1. Prepare JSONL with one chat.completions request per article
 *   2. Upload JSONL file to OpenAI
 *   3. Create a batch job
 *   4. Poll for completion (up to 24h, usually minutes)
 *   5. Download results and persist summaries
 */

import type { Article, SummaryContent } from '@aijourney/shared';
import OpenAI from 'openai';
import { completeAgentRun, failAgentRun, startAgentRun } from './agent-run-logger.js';
import {
  getAllArticles,
  getArticleById,
  getArticlesByStatus,
  updateArticleStatus,
} from './article-repository.js';
import { extractArticleText } from './crawler.js';
import { log } from './log-stream.js';
import {
  deleteSummaryByArticleId,
  getSummaryByArticleId,
  saveSummary,
} from './summary-repository.js';

const OPENAI_MODEL = process.env.OPENAI_SUMMARIZATION_MODEL || 'gpt-5-nano';
const PROMPT_VERSION = 'v2-batch';

/** Maximum article text length (characters) sent to OpenAI */
const MAX_ARTICLE_LENGTH = 12_000;

/** Poll interval in ms when waiting for batch completion */
const POLL_INTERVAL_MS = 10_000;

/** Maximum time to wait for a batch (2 hours) */
const MAX_WAIT_MS = 2 * 60 * 60 * 1000;

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is not set');
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
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

export interface BatchSummarizationResult {
  batchId: string;
  status: 'submitted' | 'completed' | 'failed' | 'expired';
  totalArticles: number;
  summarized: number;
  skipped: number;
  errors: string[];
  totalTokensUsed: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  /** Articles with relevanceScore below threshold */
  lowRelevanceArticles: Array<{
    articleId: string;
    title: string;
    relevanceScore: number;
    relevanceReason: string;
  }>;
}

interface BatchRequestLine {
  custom_id: string;
  method: 'POST';
  url: '/v1/chat/completions';
  body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    response_format: { type: 'json_object' };
    max_completion_tokens: number;
  };
}

interface ArticlePrepared {
  article: Article;
  text: string;
}

// ── Track active batches ──

const activeBatches = new Map<
  string,
  {
    batchId: string;
    status: string;
    articles: Map<string, Article>;
    startedAt: string;
  }
>();

export function getActiveBatches(): Array<{
  batchId: string;
  status: string;
  articleCount: number;
  startedAt: string;
}> {
  return Array.from(activeBatches.values()).map((b) => ({
    batchId: b.batchId,
    status: b.status,
    articleCount: b.articles.size,
    startedAt: b.startedAt,
  }));
}

/**
 * Prepare articles for batch summarization.
 * Fetches text for each article (re-crawls if needed).
 */
async function prepareArticles(
  mode: 'new' | 'all' | 'resummarize',
): Promise<{ prepared: ArticlePrepared[]; skipped: number; errors: string[] }> {
  let articles: Article[];
  const errors: string[] = [];
  let skipped = 0;

  if (mode === 'new') {
    articles = await getArticlesByStatus('quality_passed');
  } else if (mode === 'resummarize') {
    // Re-summarize everything — get all articles that have been processed
    const summarized = await getArticlesByStatus('summarized');
    const ingested = await getArticlesByStatus('ingested');
    const qualityPassed = await getArticlesByStatus('quality_passed');
    articles = [...summarized, ...ingested, ...qualityPassed];
  } else {
    articles = await getAllArticles();
  }

  const prepared: ArticlePrepared[] = [];

  for (const article of articles) {
    // In "new" mode, skip articles that already have a summary
    if (mode === 'new') {
      const existing = await getSummaryByArticleId(article.id);
      if (existing) {
        skipped++;
        continue;
      }
    }

    try {
      const text = await extractArticleText(article.url);
      if (!text || text.length < 100) {
        errors.push(`${article.id}: insufficient text`);
        continue;
      }

      const truncated =
        text.length > MAX_ARTICLE_LENGTH
          ? text.slice(0, MAX_ARTICLE_LENGTH) + '\n\n[...article truncated]'
          : text;

      prepared.push({ article, text: truncated });
    } catch (err) {
      errors.push(`${article.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { prepared, skipped, errors };
}

/**
 * Build JSONL content for the OpenAI Batch API.
 */
function buildJsonl(articles: ArticlePrepared[]): string {
  const lines: string[] = [];

  for (const { article, text } of articles) {
    const userPrompt = `Summarize the following article:\n\nTitle: ${article.title}\nSource: ${article.url}\n\n---\n${text}\n---`;

    const line: BatchRequestLine = {
      custom_id: article.id,
      method: 'POST',
      url: '/v1/chat/completions',
      body: {
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 2000,
      },
    };

    lines.push(JSON.stringify(line));
  }

  return lines.join('\n');
}

/**
 * Submit a batch summarization job to OpenAI.
 * Returns the batch ID for tracking.
 */
export async function submitBatchSummarization(
  mode: 'new' | 'all' | 'resummarize' = 'new',
): Promise<{
  batchId: string;
  articleCount: number;
  skipped: number;
  errors: string[];
}> {
  const agentRun = await startAgentRun({
    agent: 'summarizer',
    input: `Batch summarization (mode=${mode})`,
    model: OPENAI_MODEL,
    metadata: { mode, batchApi: true },
  });

  try {
    log('info', `Batch summarization: preparing articles (mode=${mode})`);
    const { prepared, skipped, errors } = await prepareArticles(mode);

    if (prepared.length === 0) {
      await completeAgentRun(agentRun.id, {
        output: `No articles to summarize (${skipped} skipped, ${errors.length} errors)`,
        tokensUsed: 0,
        promptTokens: 0,
        completionTokens: 0,
        durationMs: 0,
        metadata: { skipped, errors },
      });
      return { batchId: '', articleCount: 0, skipped, errors };
    }

    // If mode is resummarize, delete existing summaries first
    if (mode === 'resummarize') {
      log('info', `Deleting existing summaries for ${prepared.length} articles`);
      for (const { article } of prepared) {
        await deleteSummaryByArticleId(article.id);
      }
    }

    const jsonl = buildJsonl(prepared);
    const openai = getOpenAI();

    log('info', `Uploading JSONL batch file (${prepared.length} articles, ${jsonl.length} bytes)`);

    // Upload the JSONL file
    const file = await openai.files.create({
      file: new File([jsonl], 'batch-summarize.jsonl', {
        type: 'application/jsonl',
      }),
      purpose: 'batch',
    });

    log('info', `File uploaded: ${file.id}`);

    // Create batch
    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
      metadata: {
        purpose: 'article-summarization',
        mode,
        article_count: String(prepared.length),
      },
    });

    log('info', `Batch created: ${batch.id} (status=${batch.status})`);

    // Track the batch
    const articleMap = new Map(prepared.map(({ article }) => [article.id, article]));
    activeBatches.set(batch.id, {
      batchId: batch.id,
      status: batch.status,
      articles: articleMap,
      startedAt: new Date().toISOString(),
    });

    // Start background polling
    void pollAndProcessBatch(batch.id, agentRun.id);

    return {
      batchId: batch.id,
      articleCount: prepared.length,
      skipped,
      errors,
    };
  } catch (err) {
    await failAgentRun(agentRun.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/**
 * Poll for batch completion and process results.
 */
async function pollAndProcessBatch(batchId: string, agentRunId: string): Promise<void> {
  const openai = getOpenAI();
  const startTime = Date.now();

  let batch: OpenAI.Batches.Batch;

  try {
    // Poll until complete
    while (true) {
      batch = await openai.batches.retrieve(batchId);
      const tracked = activeBatches.get(batchId);
      if (tracked) tracked.status = batch.status;

      log(
        'debug',
        `Batch ${batchId}: status=${batch.status}, completed=${batch.request_counts?.completed ?? 0}/${batch.request_counts?.total ?? 0}`,
      );

      if (
        batch.status === 'completed' ||
        batch.status === 'failed' ||
        batch.status === 'expired' ||
        batch.status === 'cancelled'
      ) {
        break;
      }

      if (Date.now() - startTime > MAX_WAIT_MS) {
        log('warn', `Batch ${batchId}: timed out after ${MAX_WAIT_MS}ms`);
        break;
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    if (batch!.status !== 'completed') {
      const msg = `Batch ${batchId} ended with status: ${batch!.status}`;
      log('error', msg);
      await failAgentRun(agentRunId, msg, Date.now() - startTime);
      return;
    }

    // Download and process results
    const result = await processCompletedBatch(batchId, batch!);
    const durationMs = Date.now() - startTime;

    log(
      'info',
      `Batch ${batchId} processed: ${result.summarized} summarized, ${result.errors.length} errors, ${result.totalTokensUsed} tokens`,
    );

    await completeAgentRun(agentRunId, {
      output: `Batch ${batchId}: ${result.summarized} summarized, ${result.lowRelevanceArticles.length} low-relevance, ${result.errors.length} errors`,
      tokensUsed: result.totalTokensUsed,
      promptTokens: result.totalPromptTokens,
      completionTokens: result.totalCompletionTokens,
      durationMs,
      metadata: {
        batchId,
        summarized: result.summarized,
        lowRelevanceCount: result.lowRelevanceArticles.length,
        errors: result.errors,
      },
    });
  } catch (err) {
    log(
      'error',
      `Batch ${batchId} processing failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    await failAgentRun(
      agentRunId,
      err instanceof Error ? err.message : String(err),
      Date.now() - startTime,
    );
  }
}

/**
 * Download and process results from a completed batch.
 */
async function processCompletedBatch(
  batchId: string,
  batch: OpenAI.Batches.Batch,
): Promise<BatchSummarizationResult> {
  const openai = getOpenAI();
  const tracked = activeBatches.get(batchId);
  const articleMap = tracked?.articles ?? new Map<string, Article>();

  const result: BatchSummarizationResult = {
    batchId,
    status: 'completed',
    totalArticles: batch.request_counts?.total ?? 0,
    summarized: 0,
    skipped: 0,
    errors: [],
    totalTokensUsed: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    lowRelevanceArticles: [],
  };

  if (!batch.output_file_id) {
    result.errors.push('No output file in batch response');
    return result;
  }

  // Download the output file
  const outputContent = await openai.files.content(batch.output_file_id);
  const text = await outputContent.text();
  const lines = text.trim().split('\n');

  for (const line of lines) {
    try {
      const response = JSON.parse(line) as {
        custom_id: string;
        response: {
          status_code: number;
          body: {
            choices: Array<{
              message: { content: string };
            }>;
            usage?: {
              total_tokens: number;
              prompt_tokens: number;
              completion_tokens: number;
            };
          };
        };
        error?: { message: string };
      };

      const articleId = response.custom_id;
      const article = articleMap.get(articleId) || (await getArticleById(articleId));

      if (!article) {
        result.errors.push(`Article ${articleId} not found`);
        continue;
      }

      if (response.error) {
        result.errors.push(`${articleId}: ${response.error.message}`);
        continue;
      }

      if (response.response.status_code !== 200) {
        result.errors.push(`${articleId}: HTTP ${response.response.status_code}`);
        continue;
      }

      const content = response.response.body.choices[0]?.message?.content;
      if (!content) {
        result.errors.push(`${articleId}: empty response`);
        continue;
      }

      const usage = response.response.body.usage;
      const tokensUsed = usage?.total_tokens ?? 0;
      const promptTokens = usage?.prompt_tokens ?? 0;
      const completionTokens = usage?.completion_tokens ?? 0;

      result.totalTokensUsed += tokensUsed;
      result.totalPromptTokens += promptTokens;
      result.totalCompletionTokens += completionTokens;

      // Parse the summary
      let parsed: SummaryContent;
      try {
        parsed = JSON.parse(content) as SummaryContent;
      } catch {
        result.errors.push(`${articleId}: invalid JSON in response`);
        continue;
      }

      if (!parsed.title || !parsed.keyPoints?.length || !parsed.tags?.length) {
        result.errors.push(`${articleId}: incomplete summary`);
        continue;
      }

      // Track low-relevance articles
      const relevanceScore =
        (parsed as SummaryContent & { relevanceScore?: number }).relevanceScore ?? 1.0;
      const relevanceReason =
        (parsed as SummaryContent & { relevanceReason?: string }).relevanceReason ?? '';

      if (relevanceScore < 0.5) {
        result.lowRelevanceArticles.push({
          articleId,
          title: parsed.title,
          relevanceScore,
          relevanceReason,
        });
      }

      // Persist the summary
      await saveSummary({
        articleId,
        runRequestId: batchId,
        version: 1,
        content: {
          ...parsed,
          relevanceScore,
          relevanceReason,
        },
        model: OPENAI_MODEL,
        promptVersion: PROMPT_VERSION,
        tokensUsed,
        promptTokens,
        completionTokens,
      });

      await updateArticleStatus(articleId, 'summarized');
      result.summarized++;

      log(
        'debug',
        `Batch result: ${parsed.title} (relevance=${relevanceScore.toFixed(2)}, ${tokensUsed} tokens)`,
        {
          articleId,
          relevanceScore,
        },
      );
    } catch (err) {
      result.errors.push(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Process error file if present
  if (batch.error_file_id) {
    try {
      const errorContent = await openai.files.content(batch.error_file_id);
      const errorText = await errorContent.text();
      const errorLines = errorText.trim().split('\n').filter(Boolean);
      for (const errLine of errorLines) {
        try {
          const parsed = JSON.parse(errLine) as {
            custom_id: string;
            error: { message: string };
          };
          result.errors.push(`${parsed.custom_id}: ${parsed.error.message}`);
        } catch {
          result.errors.push(`Batch error: ${errLine.slice(0, 200)}`);
        }
      }
    } catch {
      log('warn', 'Could not read batch error file');
    }
  }

  // Clean up tracking
  activeBatches.delete(batchId);

  return result;
}

/**
 * Check the status of a batch job.
 */
export async function checkBatchStatus(batchId: string): Promise<{
  status: string;
  total: number;
  completed: number;
  failed: number;
}> {
  const openai = getOpenAI();
  const batch = await openai.batches.retrieve(batchId);
  return {
    status: batch.status,
    total: batch.request_counts?.total ?? 0,
    completed: batch.request_counts?.completed ?? 0,
    failed: batch.request_counts?.failed ?? 0,
  };
}
