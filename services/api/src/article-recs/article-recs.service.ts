import type {
  ArticleRecommendation,
  CandidateArticle,
  RecAdminStats,
  RecBatch,
  RecBatchStatus,
  User,
} from '@aijourney/shared';
import { generateId, nowISO } from '@aijourney/shared';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Queue, QueueEvents, Worker } from 'bullmq';
import OpenAI from 'openai';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import { CompanyContextService } from '../company-context/company-context.service';
import { AppConfigService } from '../config/config.service';
import { MemoryRepository } from '../memory/memory.repository';
import { UsersRepository } from '../users/users.repository';
import { ArticleRecsRepository } from './article-recs.repository';

const QUEUE_NAME = 'article-recommendations';
const OPENAI_MODEL = 'gpt-5.4';
const HIGH_REASONING = { effort: 'high' as const };
const ARTICLES_PER_JOB_TITLE = 10;
const ARTICLES_PER_USER = 1; // per run (runs twice/week = 2/week)

/** Schedule: Monday and Thursday at 08:00 UTC */
const SCHEDULE_CRON_PATTERN = '0 8 * * 1,4';

@Injectable()
export class ArticleRecsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ArticleRecsService.name);
  private queue!: Queue;
  private worker!: Worker;
  private scheduler!: Worker;
  private queueEvents!: QueueEvents;

  constructor(
    @Inject(ArticleRecsRepository)
    private readonly recsRepo: ArticleRecsRepository,
    @Inject(UsersRepository)
    private readonly usersRepo: UsersRepository,
    @Inject(MemoryRepository)
    private readonly memoryRepo: MemoryRepository,
    @Inject(AgentRunsService)
    private readonly agentRunsService: AgentRunsService,
    @Inject(AppConfigService)
    private readonly configService: AppConfigService,
    @Inject(CompanyContextService)
    private readonly companyContextService: CompanyContextService,
  ) {}

  // ── Lifecycle ──

  async onModuleInit() {
    const redisUrl = this.configService.config.REDIS_URL;
    const url = new URL(redisUrl);
    const connection = {
      host: url.hostname,
      port: Number(url.port) || 6379,
      ...(url.password && { password: url.password }),
    };

    this.queue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });

    this.queueEvents = new QueueEvents(QUEUE_NAME, { connection });

    // Worker processes batch recommendation jobs
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const { batchId, tenantId } = job.data as {
          batchId: string;
          tenantId?: string;
        };
        return this.processBatch(batchId, tenantId);
      },
      {
        connection,
        concurrency: 1,
        limiter: { max: 1, duration: 5_000 },
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Recommendation batch job ${job.id} completed`);
    });
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Recommendation batch job ${job?.id} failed: ${err.message}`);
    });

    // Register repeatable job (twice per week: Mon + Thu at 08:00 UTC)
    await this.queue.upsertJobScheduler(
      'article-recs-scheduler',
      { pattern: SCHEDULE_CRON_PATTERN },
      {
        name: 'scheduled-batch',
        data: { scheduled: true },
      },
    );

    this.logger.log(`Article recommendations initialized. Schedule: ${SCHEDULE_CRON_PATTERN}`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queueEvents?.close();
    await this.queue?.close();
  }

  // ── Public API ──

  /** Trigger a recommendation batch manually (admin action) */
  async triggerBatch(tenantId?: string): Promise<RecBatch> {
    const batch = await this.createBatchRecord(tenantId);
    await this.queue.add('manual-batch', {
      batchId: batch.id,
      tenantId,
    });
    this.logger.log(`Manual batch triggered: ${batch.id}`);
    return batch;
  }

  /** Get recommendations for a user (for dashboard) */
  async getForUser(userId: string, limit = 10) {
    return this.recsRepo.getRecsForUser(userId, limit);
  }

  /** Get pending (unread) recommendations for a user */
  async getPendingForUser(userId: string) {
    return this.recsRepo.getPendingRecsForUser(userId);
  }

  /** Mark recommendation as read */
  async markAsRead(recId: string) {
    return this.recsRepo.updateRecStatus(recId, 'read');
  }

  /** Dismiss a recommendation */
  async dismiss(recId: string) {
    return this.recsRepo.updateRecStatus(recId, 'dismissed');
  }

  /** Get admin statistics */
  async getAdminStats(tenantId?: string): Promise<RecAdminStats> {
    const [counts, total, lastBatch, jobTitleStats] = await Promise.all([
      this.recsRepo.countByStatus(tenantId),
      this.recsRepo.countTotal(tenantId),
      this.recsRepo.getLastBatch(tenantId),
      this.recsRepo.getJobTitleStats(tenantId),
    ]);

    const readRate = total > 0 ? Number(((counts.read / total) * 100).toFixed(1)) : 0;

    return {
      totalBatches: (await this.recsRepo.listBatches(10000)).length,
      totalRecommendations: total,
      readCount: counts.read,
      dismissedCount: counts.dismissed,
      pendingCount: counts.pending,
      readRate,
      lastBatch: lastBatch
        ? {
            id: lastBatch.id,
            status: lastBatch.status,
            completedAt: lastBatch.completedAt,
            totalRecommendations: lastBatch.totalRecommendations,
          }
        : undefined,
      jobTitleStats,
    };
  }

  /** List batch history */
  async listBatches(tenantId?: string, limit = 20) {
    return tenantId
      ? this.recsRepo.listBatchesByTenant(tenantId, limit)
      : this.recsRepo.listBatches(limit);
  }

  /** Get recommendations for a specific batch */
  async getRecsByBatch(batchId: string) {
    return this.recsRepo.getRecsByBatch(batchId);
  }

  /** Get queue stats */
  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);
    const repeatableJobs = await this.queue.getJobSchedulers();
    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      schedulers: repeatableJobs.map((j) => ({
        id: j.id,
        name: j.name,
        pattern: j.pattern,
        next: j.next,
      })),
    };
  }

  // ── Internal pipeline ──

  private async createBatchRecord(tenantId?: string): Promise<RecBatch> {
    const now = nowISO();
    const batch: RecBatch = {
      id: generateId(),
      tenantId: tenantId ?? '',
      status: 'pending',
      jobTitles: [],
      candidates: [],
      totalUsers: 0,
      totalRecommendations: 0,
      agentRunIds: [],
      startedAt: now,
      createdAt: now,
    };
    return this.recsRepo.createBatch(batch);
  }

  private async processBatch(batchId: string, tenantId?: string): Promise<Record<string, unknown>> {
    const batch = await this.recsRepo.getBatchById(batchId);
    if (!batch) throw new Error(`Batch ${batchId} not found`);

    try {
      await this.updateBatchStatus(batchId, 'fetching_articles');

      // Step 1: Get all users grouped by job title
      const usersByJobTitle = await this.getUsersByJobTitle(tenantId);
      const activeJobTitles = Object.keys(usersByJobTitle);
      this.logger.log(`Batch ${batchId}: ${activeJobTitles.length} active job titles`);

      if (activeJobTitles.length === 0) {
        await this.recsRepo.updateBatch(batchId, {
          status: 'completed',
          completedAt: nowISO(),
          jobTitles: [],
          totalUsers: 0,
          totalRecommendations: 0,
        });
        return { status: 'completed', reason: 'no_active_job_titles' };
      }

      await this.recsRepo.updateBatch(batchId, {
        jobTitles: activeJobTitles,
      });

      // Step 2: For each job title, fetch 10 candidate articles from RAG
      const allCandidates = await this.fetchCandidatesForJobTitles(
        activeJobTitles,
        usersByJobTitle,
        batchId,
      );

      await this.recsRepo.updateBatch(batchId, {
        candidates: allCandidates,
      });

      // Step 3: For each user, use LLM to select 1 article from candidates
      await this.updateBatchStatus(batchId, 'selecting_articles');

      let totalRecs = 0;
      let totalUsers = 0;

      for (const jobTitle of activeJobTitles) {
        const users = usersByJobTitle[jobTitle] ?? [];
        const candidates = allCandidates.find((c) => c.jobTitle === jobTitle)?.articles ?? [];

        if (candidates.length === 0) {
          this.logger.warn(
            `No candidates for job title "${jobTitle}", skipping ${users.length} users`,
          );
          continue;
        }

        for (const user of users) {
          try {
            const rec = await this.selectArticleForUser(user, candidates, jobTitle, batchId);
            if (rec) {
              totalRecs++;
            }
          } catch (err) {
            this.logger.error(
              `Failed to select article for user ${user.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
        totalUsers += users.length;
      }

      await this.recsRepo.updateBatch(batchId, {
        status: 'completed',
        completedAt: nowISO(),
        totalUsers,
        totalRecommendations: totalRecs,
      });

      this.logger.log(
        `Batch ${batchId} completed: ${totalRecs} recommendations for ${totalUsers} users`,
      );

      return {
        status: 'completed',
        totalUsers,
        totalRecommendations: totalRecs,
        jobTitles: activeJobTitles.length,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.recsRepo.updateBatch(batchId, {
        status: 'failed',
        error: message,
        completedAt: nowISO(),
      });
      throw err;
    }
  }

  private async updateBatchStatus(batchId: string, status: RecBatchStatus): Promise<void> {
    await this.recsRepo.updateBatch(batchId, { status });
  }

  /**
   * Group users by jobTitle. Only users with a non-empty jobTitle are included.
   */
  private async getUsersByJobTitle(tenantId?: string): Promise<Record<string, User[]>> {
    const users = tenantId
      ? await this.usersRepo.listByTenant(tenantId)
      : await this.usersRepo.listAll();

    const grouped: Record<string, User[]> = {};
    for (const user of users) {
      if (!user.jobTitle) continue;
      const title = user.jobTitle.trim();
      if (!title) continue;
      if (!grouped[title]) grouped[title] = [];
      grouped[title]!.push(user);
    }
    return grouped;
  }

  /**
  * Step 2: For each job title, query RAG to find 10 relevant articles.
  * Uses gpt-5.4 with high reasoning to formulate the RAG query based on the job title.
   */
  private async fetchCandidatesForJobTitles(
    jobTitles: string[],
    usersByJobTitle: Record<string, User[]>,
    batchId: string,
  ) {
    const kbBuilderUrl = this.configService.config.KB_BUILDER_URL;
    const candidates = [];

    for (const jobTitle of jobTitles) {
      const agentRun = await this.agentRunsService.startRun({
        agent: 'article-rec-fetch',
        input: `Fetching articles for job title: ${jobTitle}`,
        model: OPENAI_MODEL,
        metadata: { batchId, jobTitle },
      });

      try {
        // Use gpt-5.4 to create a targeted RAG query for this job title.
        const ragQuery = await this.buildRagQueryForJobTitle(jobTitle);

        // Query RAG system via KB Builder HTTP API
        const ragResponse = await fetch(`${kbBuilderUrl}/rag/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: ragQuery,
            topK: ARTICLES_PER_JOB_TITLE,
            scoreThreshold: 0.2,
          }),
        });

        if (!ragResponse.ok) {
          throw new Error(`RAG query failed: ${ragResponse.status} ${await ragResponse.text()}`);
        }

        const ragData = (await ragResponse.json()) as {
          data: {
            chunks: {
              text: string;
              score: number;
              metadata: {
                article_url: string;
                article_title: string;
                article_source: string;
                summary_title: string;
                tags: string[];
                difficulty: string;
              };
            }[];
          };
        };

        // Deduplicate by article URL and build candidates
        const seen = new Set<string>();
        const articles: CandidateArticle[] = [];

        for (const chunk of ragData.data?.chunks ?? []) {
          const url = chunk.metadata.article_url;
          if (seen.has(url)) continue;
          seen.add(url);

          articles.push({
            url,
            title: chunk.metadata.summary_title || chunk.metadata.article_title,
            source: chunk.metadata.article_source,
            summary: chunk.text.slice(0, 500),
            tags: chunk.metadata.tags ?? [],
            difficulty: chunk.metadata.difficulty || 'intermediate',
            ragScore: chunk.score,
          });

          if (articles.length >= ARTICLES_PER_JOB_TITLE) break;
        }

        const entry = {
          jobTitle,
          userCount: usersByJobTitle[jobTitle]?.length ?? 0,
          articles,
          fetchedAt: nowISO(),
        };
        candidates.push(entry);

        await this.agentRunsService.completeRun(agentRun.id, {
          output: `Found ${articles.length} candidate articles for "${jobTitle}"`,
          metadata: {
            batchId,
            jobTitle,
            articleCount: articles.length,
            ragQuery,
          },
        });

        // Update batch with agent run ID
        const currentBatch = await this.recsRepo.getBatchById(batchId);
        if (currentBatch) {
          await this.recsRepo.updateBatch(batchId, {
            agentRunIds: [...currentBatch.agentRunIds, agentRun.id],
          });
        }

        this.logger.log(`Fetched ${articles.length} candidates for "${jobTitle}"`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.agentRunsService.failRun(agentRun.id, message);
        this.logger.error(`Failed to fetch candidates for "${jobTitle}": ${message}`);
        // Continue with other job titles
        candidates.push({
          jobTitle,
          userCount: usersByJobTitle[jobTitle]?.length ?? 0,
          articles: [],
          fetchedAt: nowISO(),
        });
      }
    }

    return candidates;
  }

  /**
   * Use gpt-5.4 with high reasoning to generate a good RAG search query for a job title.
   */
  private async buildRagQueryForJobTitle(jobTitle: string): Promise<string> {
    const openai = new OpenAI();

    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      reasoning: HIGH_REASONING,
      max_output_tokens: 12000,
      instructions:
        'You are a search query generator. Given a job title, generate a concise RAG search query (2-3 sentences) that would find the most relevant AI-related articles for someone in that role. Focus on practical AI applications, tools, and workflows relevant to their daily work. Return ONLY the search query text, nothing else.',
      input: `Job title: ${jobTitle}`,
    });

    return response.output_text?.trim() || `AI tools and workflows for ${jobTitle}`;
  }

  /**
  * Step 3: For a specific user, use gpt-5.4 + long-term memory to select
   * exactly 1 article from the candidates list.
   */
  private async selectArticleForUser(
    user: User,
    candidates: CandidateArticle[],
    jobTitle: string,
    batchId: string,
  ): Promise<ArticleRecommendation | null> {
    const agentRun = await this.agentRunsService.startRun({
      agent: 'article-rec-select',
      input: `Selecting article for user ${user.email} (${jobTitle})`,
      model: OPENAI_MODEL,
      metadata: { batchId, userId: user.id, jobTitle },
    });

    try {
      // Fetch user's long-term memory facts
      const memoryFacts = await this.memoryRepo.getFactsByUser(user.id);

      const memoryContext =
        memoryFacts.length > 0
          ? memoryFacts.map((f) => `[${f.category}] ${f.fact}`).join('\n')
          : 'No long-term memory available for this user.';

      // Build the article list for the prompt
      const articleList = candidates
        .map(
          (a, i) =>
            `${i + 1}. "${a.title}" (${a.source})\n   Tags: ${a.tags.join(', ')}\n   Difficulty: ${a.difficulty}\n   Summary: ${a.summary}`,
        )
        .join('\n\n');

      const openai = new OpenAI();

      // Inject company context if available
      let companyContextBlock = '';
      if (user.tenantId) {
        const companyCtx = await this.companyContextService.getFormattedContext(user.tenantId);
        if (companyCtx) {
          companyContextBlock = companyCtx;
        }
      }

      const systemContent = `You are a personalized article recommender. Your task is to select exactly ONE article from the candidate list that would be most valuable for this specific user to read this week.

Consider:
- The user's job title and daily responsibilities
- The user's known preferences, goals, and skill level (from their memory profile)
- The user's company context and industry (if available)
- Article relevance, difficulty match, and practical applicability
- Variety — avoid recommending similar topics the user has likely already seen

Respond with a JSON object: { "selectedIndex": <1-based index>, "reason": "<2-3 sentence explanation of why this article is the best pick for this user>" }${companyContextBlock}`;

      const response = await openai.responses.create({
        model: OPENAI_MODEL,
        reasoning: HIGH_REASONING,
        max_output_tokens: 12000,
        instructions: systemContent,
        input: `## User Profile
Name: ${user.name}
Job Title: ${user.jobTitle || 'Unknown'}
Department: ${user.department || 'Unknown'}

## User Memory (Long-term facts about this user)
${memoryContext}

## Candidate Articles (pick exactly ONE)
${articleList}`,
      });

      const content = response.output_text || '';
      let parsed: { selectedIndex: number; reason: string };

      try {
        parsed = JSON.parse(content);
      } catch {
        this.logger.warn(
          `Failed to parse LLM response for user ${user.id}: ${content.slice(0, 200)}`,
        );
        // Fall back to first article
        parsed = {
          selectedIndex: 1,
          reason: 'Default selection (LLM response parsing failed)',
        };
      }

      const idx = Math.max(0, Math.min(candidates.length - 1, (parsed.selectedIndex || 1) - 1));
      const selectedArticle = candidates[idx]!;

      const rec: ArticleRecommendation = {
        id: generateId(),
        tenantId: user.tenantId || '',
        userId: user.id,
        batchId,
        jobTitle,
        article: {
          url: selectedArticle.url,
          title: selectedArticle.title,
          source: selectedArticle.source,
          summary: selectedArticle.summary,
          tags: selectedArticle.tags,
          difficulty: selectedArticle.difficulty,
        },
        reason: parsed.reason || '',
        status: 'pending',
        createdAt: nowISO(),
      };

      await this.recsRepo.createRec(rec);

      await this.agentRunsService.completeRun(agentRun.id, {
        output: `Selected "${selectedArticle.title}" for ${user.email}`,
        tokensUsed: response.usage?.total_tokens ?? 0,
        promptTokens: response.usage?.input_tokens,
        completionTokens: response.usage?.output_tokens,
        metadata: {
          batchId,
          userId: user.id,
          selectedArticle: selectedArticle.title,
          reason: parsed.reason,
        },
      });

      return rec;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.agentRunsService.failRun(agentRun.id, message);
      throw err;
    }
  }
}
