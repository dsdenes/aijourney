import {
	Inject,
	Injectable,
	Logger,
	type OnModuleDestroy,
	type OnModuleInit,
} from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { Response } from "express";
import { AppConfigService } from "../config/config.service";

/** Describes a single worker queue and its capabilities */
export interface WorkerDefinition {
	name: string;
	slug: string;
	description: string;
	queueName: string;
	concurrency: number;
	defaultJobData: Record<string, unknown>;
}

export interface QueueStats {
	name: string;
	slug: string;
	waiting: number;
	active: number;
	completed: number;
	failed: number;
	delayed: number;
	paused: boolean;
}

export interface JobInfo {
	id: string | undefined;
	name: string;
	data: Record<string, unknown>;
	status: string;
	progress: unknown;
	attemptsMade: number;
	processedOn: number | undefined;
	finishedOn: number | undefined;
	failedReason: string | undefined;
	returnvalue: unknown;
	timestamp: number;
	duration: number | undefined;
}

const WORKER_DEFINITIONS: WorkerDefinition[] = [
	{
		name: "Summarization",
		slug: "summarization",
		description:
			"Processes articles through OpenAI to generate concise summaries. Fetches article content from DynamoDB, calls the LLM, tracks token usage, and stores results.",
		queueName: "summarization",
		concurrency: 2,
		defaultJobData: { runRequestId: "manual", articleId: "" },
	},
	{
		name: "Personalization",
		slug: "personalization",
		description:
			"Generates personalized AI journey steps for users. Queries Bedrock KB for relevant articles, uses OpenAI to craft personalized learning paths based on user profile and journey context.",
		queueName: "personalization",
		concurrency: 2,
		defaultJobData: { runRequestId: "manual", userId: "", journeyId: "" },
	},
	{
		name: "KB Chat",
		slug: "kb-chat",
		description:
			"RAG-powered chat worker. Retrieves context from Bedrock Knowledge Base, constructs prompts, streams LLM responses with cancel-flag checking every 10 chunks.",
		queueName: "kb-chat",
		concurrency: 3,
		defaultJobData: { runRequestId: "manual", userId: "", query: "" },
	},
	{
		name: "KB Builder",
		slug: "kb-builder",
		description:
			"Standalone pipeline service that crawls target URLs, extracts and cleans content, deduplicates, stores in S3, creates DynamoDB article records, generates summaries via OpenAI, and triggers Bedrock KB sync.",
		queueName: "",
		concurrency: 1,
		defaultJobData: {},
	},
];

@Injectable()
export class WorkersService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(WorkersService.name);
	private redis!: IORedis;
	private queues = new Map<string, Queue>();

	constructor(
		@Inject(AppConfigService) private readonly configService: AppConfigService,
	) {}

	async onModuleInit() {
		const redisUrl = this.configService.config.REDIS_URL;
		const url = new URL(redisUrl);
		this.redis = new IORedis({
			host: url.hostname,
			port: Number(url.port) || 6379,
			...(url.password && { password: url.password }),
			maxRetriesPerRequest: null,
		});

		const connection = {
			host: url.hostname,
			port: Number(url.port) || 6379,
			...(url.password && { password: url.password }),
		};

		// Create Queue instances for BullMQ workers (not kb-builder — it's standalone)
		for (const def of WORKER_DEFINITIONS) {
			if (def.queueName) {
				this.queues.set(def.slug, new Queue(def.queueName, { connection }));
			}
		}

		this.logger.log(
			`Workers service initialized with ${this.queues.size} BullMQ queues`,
		);
	}

	async onModuleDestroy() {
		for (const queue of this.queues.values()) {
			await queue.close();
		}
		this.redis.disconnect();
	}

	getDefinitions(): WorkerDefinition[] {
		return [...WORKER_DEFINITIONS];
	}

	getDefinition(slug: string): WorkerDefinition | undefined {
		return WORKER_DEFINITIONS.find((d) => d.slug === slug);
	}

	async getQueueStats(slug: string): Promise<QueueStats | null> {
		const queue = this.queues.get(slug);
		if (!queue) return null;

		const [waiting, active, completed, failed, delayed, paused] =
			await Promise.all([
				queue.getWaitingCount(),
				queue.getActiveCount(),
				queue.getCompletedCount(),
				queue.getFailedCount(),
				queue.getDelayedCount(),
				queue.isPaused(),
			]);

		const def = this.getDefinition(slug);
		if (!def) return null;
		return {
			name: def.name,
			slug,
			waiting,
			active,
			completed,
			failed,
			delayed,
			paused,
		};
	}

	async getAllQueueStats(): Promise<QueueStats[]> {
		const stats: QueueStats[] = [];
		for (const def of WORKER_DEFINITIONS) {
			if (def.queueName) {
				const s = await this.getQueueStats(def.slug);
				if (s) stats.push(s);
			}
		}
		return stats;
	}

	async getJobs(
		slug: string,
		status: "waiting" | "active" | "completed" | "failed" | "delayed",
		start = 0,
		end = 49,
	): Promise<JobInfo[]> {
		const queue = this.queues.get(slug);
		if (!queue) return [];

		const jobs = await queue.getJobs([status], start, end);
		return jobs.map((j) => ({
			id: j.id,
			name: j.name,
			data: j.data as Record<string, unknown>,
			status: j.finishedOn
				? j.failedReason
					? "failed"
					: "completed"
				: j.processedOn
					? "active"
					: "waiting",
			progress: j.progress,
			attemptsMade: j.attemptsMade,
			processedOn: j.processedOn,
			finishedOn: j.finishedOn,
			failedReason: j.failedReason,
			returnvalue: j.returnvalue,
			timestamp: j.timestamp,
			duration:
				j.finishedOn && j.processedOn
					? j.finishedOn - j.processedOn
					: undefined,
		}));
	}

	async getJobLogs(
		slug: string,
		jobId: string,
	): Promise<{ logs: string[]; count: number }> {
		const queue = this.queues.get(slug);
		if (!queue) return { logs: [], count: 0 };
		return queue.getJobLogs(jobId);
	}

	async addJob(
		slug: string,
		data: Record<string, unknown>,
	): Promise<{ jobId: string } | null> {
		const queue = this.queues.get(slug);
		if (!queue) return null;

		const job = await queue.add(slug, data, {
			removeOnComplete: { count: 100 },
			removeOnFail: { count: 100 },
		});
		this.logger.log(`Manually triggered ${slug} job: ${job.id}`);
		return { jobId: String(job.id) };
	}

	async pauseQueue(slug: string): Promise<boolean> {
		const queue = this.queues.get(slug);
		if (!queue) return false;
		await queue.pause();
		this.logger.log(`Queue ${slug} paused`);
		return true;
	}

	async resumeQueue(slug: string): Promise<boolean> {
		const queue = this.queues.get(slug);
		if (!queue) return false;
		await queue.resume();
		this.logger.log(`Queue ${slug} resumed`);
		return true;
	}

	async cleanQueue(
		slug: string,
		status: "completed" | "failed",
		grace = 0,
	): Promise<number> {
		const queue = this.queues.get(slug);
		if (!queue) return 0;
		const removed = await queue.clean(grace, 1000, status);
		this.logger.log(`Cleaned ${removed.length} ${status} jobs from ${slug}`);
		return removed.length;
	}

	async retryFailedJobs(slug: string): Promise<number> {
		const queue = this.queues.get(slug);
		if (!queue) return 0;
		const failed = await queue.getJobs(["failed"]);
		let retried = 0;
		for (const job of failed) {
			await job.retry();
			retried++;
		}
		this.logger.log(`Retried ${retried} failed jobs in ${slug}`);
		return retried;
	}

	/**
	 * KB Builder is a standalone HTTP service, so we proxy health/status/trigger via HTTP.
	 */
	async getKbBuilderStatus(): Promise<Record<string, unknown>> {
		try {
			const res = await fetch("http://localhost:3002/status");
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return {
				status: "unreachable",
				error: "KB Builder service not available",
			};
		}
	}

	async triggerKbBuilder(): Promise<Record<string, unknown>> {
		try {
			const res = await fetch("http://localhost:3002/ingest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return {
				status: "error",
				error: "KB Builder service not available",
			};
		}
	}

	async getKbBuilderHealth(): Promise<Record<string, unknown>> {
		try {
			const res = await fetch("http://localhost:3002/health");
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return {
				status: "unreachable",
				error: "KB Builder service not available",
			};
		}
	}

	async getKbBuilderProgress(): Promise<Record<string, unknown>> {
		try {
			const res = await fetch("http://localhost:3002/progress");
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { status: "unreachable", error: "KB Builder service not available" };
		}
	}

	async getKbBuilderArticles(): Promise<Record<string, unknown>> {
		try {
			const res = await fetch("http://localhost:3002/articles");
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { data: [], meta: { total: 0 }, error: "KB Builder service not available" };
		}
	}

	async getKbBuilderSources(): Promise<Record<string, unknown>> {
		try {
			const res = await fetch("http://localhost:3002/sources");
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { data: [], error: "KB Builder service not available" };
		}
	}

	async addKbBuilderSource(body: Record<string, unknown>): Promise<Record<string, unknown>> {
		try {
			const res = await fetch("http://localhost:3002/sources", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { error: "KB Builder service not available" };
		}
	}

	async updateKbBuilderSource(id: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
		try {
			const res = await fetch(`http://localhost:3002/sources/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { error: "KB Builder service not available" };
		}
	}

	async deleteKbBuilderSource(id: string): Promise<Record<string, unknown>> {
		try {
			const res = await fetch(`http://localhost:3002/sources/${id}`, {
				method: "DELETE",
			});
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { error: "KB Builder service not available" };
		}
	}

	/**
	 * Proxy SSE stream from KB Builder to client.
	 * Pipes the upstream EventSource directly to the NestJS response.
	 */
	proxyKbBuilderSSE(clientRes: Response): void {
		clientRes.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		});

		const controller = new AbortController();

		clientRes.on("close", () => {
			controller.abort();
		});

		void (async () => {
			try {
				const upstream = await fetch("http://localhost:3002/logs/stream", {
					signal: controller.signal as AbortSignal,
				});
				if (!upstream.body) {
					clientRes.write("data: {\"level\":\"error\",\"message\":\"KB Builder stream unavailable\"}\n\n");
					clientRes.end();
					return;
				}
				// Pipe upstream to client using Node.js readable stream
				const reader = upstream.body.getReader();
				const decoder = new TextDecoder();
				// eslint-disable-next-line no-constant-condition
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					const text = decoder.decode(value, { stream: true });
					clientRes.write(text);
				}
				clientRes.end();
			} catch (err) {
				if ((err as Error).name !== "AbortError") {
					this.logger.warn(`KB Builder SSE proxy error: ${(err as Error).message}`);
					try {
						clientRes.write(`data: ${JSON.stringify({ level: "error", message: "KB Builder stream disconnected", timestamp: new Date().toISOString() })}\n\n`);
					} catch { /* client already gone */ }
				}
				try { clientRes.end(); } catch { /* ignore */ }
			}
		})();
	}

	async getKbBuilderLogs(): Promise<Record<string, unknown>> {
		try {
			const res = await fetch("http://localhost:3002/logs");
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { data: [], error: "KB Builder service not available" };
		}
	}

	async clearKbBuilderLogs(): Promise<Record<string, unknown>> {
		try {
			const res = await fetch("http://localhost:3002/logs", { method: "DELETE" });
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { error: "KB Builder service not available" };
		}
	}

	async triggerKbBuilderPipeline(): Promise<Record<string, unknown>> {
		try {
			const res = await fetch("http://localhost:3002/pipeline", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { error: "KB Builder service not available" };
		}
	}

	async getKbBuilderPipelineProgress(): Promise<Record<string, unknown>> {
		try {
			const res = await fetch("http://localhost:3002/pipeline/progress");
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { data: null, error: "KB Builder service not available" };
		}
	}

	async getKbBuilderSummaries(): Promise<Record<string, unknown>> {
		try {
			const res = await fetch("http://localhost:3002/summaries");
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { data: [], error: "KB Builder service not available" };
		}
	}

	// ─── Article Deletion ───

	async deleteKbBuilderArticle(articleId: string): Promise<Record<string, unknown>> {
		try {
			const res = await fetch(`http://localhost:3002/articles/${articleId}`, {
				method: "DELETE",
			});
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { error: "KB Builder service not available" };
		}
	}

	// ─── Batch Summarization ───

	async submitBatchSummarization(mode: string): Promise<Record<string, unknown>> {
		try {
			const res = await fetch("http://localhost:3002/batch-summarize", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ mode }),
			});
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { error: "KB Builder service not available" };
		}
	}

	async getBatchSummarizationStatus(batchId: string): Promise<Record<string, unknown>> {
		try {
			const res = await fetch(`http://localhost:3002/batch-summarize/${batchId}`);
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { error: "KB Builder service not available" };
		}
	}

	async getActiveBatches(): Promise<Record<string, unknown>> {
		try {
			const res = await fetch("http://localhost:3002/batch-summarize");
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { data: [], error: "KB Builder service not available" };
		}
	}
}
