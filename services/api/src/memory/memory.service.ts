import type {
  MemoryExtractionJob,
  MemoryFact,
  MemoryQueueStats,
  MemorySource,
  MemoryStats,
} from '@aijourney/shared';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { AppConfigService } from '../config/config.service';
import { MemoryExtractionService } from './memory-extraction.service';
import { MemoryRepository } from './memory.repository';

const QUEUE_NAME = 'memory-extraction';
/** gpt-5.2-nano rate limit: conservative 200 RPM → process max ~3/sec */
const MAX_CONCURRENCY = 1;
const RATE_LIMIT_MAX = 150; // jobs per minute (below 200 RPM model limit)
const RATE_LIMIT_DURATION = 60_000; // 1 minute

@Injectable()
export class MemoryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MemoryService.name);
  private queue!: Queue;
  private worker!: Worker;

  constructor(
    @Inject(MemoryRepository)
    private readonly repo: MemoryRepository,
    @Inject(MemoryExtractionService)
    private readonly extractionService: MemoryExtractionService,
    @Inject(AppConfigService)
    private readonly configService: AppConfigService,
  ) {}

  async onModuleInit() {
    const redisUrl = this.configService.config.REDIS_URL;
    const url = new URL(redisUrl);
    const connection = {
      host: url.hostname,
      port: Number(url.port) || 6379,
      ...(url.password && { password: url.password }),
    };

    // Create queue with rate limiting
    this.queue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    });

    // Create worker in the same process (API service)
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const data = job.data as MemoryExtractionJob;
        return this.extractionService.extractAndStore(data);
      },
      {
        connection,
        concurrency: MAX_CONCURRENCY,
        limiter: {
          max: RATE_LIMIT_MAX,
          duration: RATE_LIMIT_DURATION,
        },
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(`Memory extraction job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.warn(`Memory extraction job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log(`Memory extraction queue initialized (rate limit: ${RATE_LIMIT_MAX}/min)`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  // --- Queue operations ---

  /**
   * Enqueue a fact extraction job (called after user interactions).
   * Fire-and-forget — never blocks the main request.
   */
  async enqueueExtraction(userId: string, source: MemorySource, userInput: string): Promise<void> {
    if (!userInput.trim() || userInput.trim().length < 10) {
      return; // Skip trivially short inputs
    }

    const jobData: MemoryExtractionJob = {
      userId,
      source,
      userInput: userInput.trim(),
    };

    await this.queue.add('extract', jobData, {
      // Deduplicate: only one extraction per user+source within 5 seconds
      jobId: `mem-${userId}-${source}-${Math.floor(Date.now() / 5000)}`,
    });

    this.logger.debug(`Enqueued memory extraction for user ${userId} from ${source}`);
  }

  // --- Facts (read) ---

  async getFactsForUser(userId: string): Promise<MemoryFact[]> {
    return this.repo.getFactsByUser(userId);
  }

  async deleteFactForUser(userId: string, factId: string): Promise<boolean> {
    // Verify the fact belongs to this user
    const facts = await this.repo.getAllFactsByUser(userId);
    const fact = facts.find((f) => f.id === factId);
    if (!fact) return false;
    await this.repo.deleteFact(factId);
    return true;
  }

  async clearMemoryForUser(userId: string): Promise<number> {
    return this.repo.deleteAllFactsByUser(userId);
  }

  // --- Admin stats ---

  async getStats(): Promise<MemoryStats> {
    const [totalFacts, factsByCategory, factsBySource, recentExtractions] = await Promise.all([
      this.repo.totalFactCount(),
      this.repo.globalCategoryCounts(),
      this.repo.globalSourceCounts(),
      this.repo.getRecentExtractions(30),
    ]);

    const queueStats = await this.getQueueStats();

    return {
      totalFacts,
      factsByCategory,
      factsBySource,
      queueStats,
      recentExtractions,
    };
  }

  async getQueueStats(): Promise<MemoryQueueStats> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  }
}
