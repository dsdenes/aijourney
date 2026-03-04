import {
	Body,
	Controller,
	Delete,
	Get,
	Inject,
	Param,
	Patch,
	Post,
	Query,
	Res,
} from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { WorkersService } from "./workers.service";

// TODO: Re-enable auth guards once Cognito is set up
// import { UseGuards } from "@nestjs/common";
// import { AuthGuard } from "@nestjs/passport";
// import { ApiBearerAuth } from "@nestjs/swagger";
// import { RolesGuard } from "../auth/roles.guard";
// import { Roles } from "../common/decorators/roles.decorator";

@ApiTags("workers")
@Controller("workers")
// @ApiBearerAuth()
// @UseGuards(AuthGuard("jwt"), RolesGuard)
// @Roles("admin")
export class WorkersController {
	constructor(
		@Inject(WorkersService) private readonly workersService: WorkersService,
	) {}

	@Get()
	@ApiOperation({ summary: "List all worker definitions" })
	async listWorkers() {
		const definitions = this.workersService.getDefinitions();
		const stats = await this.workersService.getAllQueueStats();
		const statsMap = new Map(stats.map((s) => [s.slug, s]));

		return {
			data: definitions.map((def) => ({
				...def,
				stats: statsMap.get(def.slug) || null,
			})),
		};
	}

	@Get("stats")
	@ApiOperation({ summary: "Get all queue statistics" })
	async getAllStats() {
		const stats = await this.workersService.getAllQueueStats();
		return { data: stats };
	}

	// ─── KB Builder Proxy Endpoints (must be before :slug routes) ───

	@Get("kb-builder/progress")
	@ApiOperation({ summary: "Get KB Builder crawl progress" })
	async kbBuilderProgress() {
		return await this.workersService.getKbBuilderProgress();
	}

	@Get("kb-builder/articles")
	@ApiOperation({ summary: "Get all crawled articles" })
	async kbBuilderArticles() {
		return await this.workersService.getKbBuilderArticles();
	}

	@Get("kb-builder/sources")
	@ApiOperation({ summary: "Get crawl sources" })
	async kbBuilderSources() {
		return await this.workersService.getKbBuilderSources();
	}

	@Post("kb-builder/sources")
	@ApiOperation({ summary: "Add a crawl source" })
	async addKbBuilderSource(@Body() body: Record<string, unknown>) {
		return await this.workersService.addKbBuilderSource(body);
	}

	@Patch("kb-builder/sources/:id")
	@ApiOperation({ summary: "Update a crawl source" })
	async updateKbBuilderSource(
		@Param("id") id: string,
		@Body() body: Record<string, unknown>,
	) {
		return await this.workersService.updateKbBuilderSource(id, body);
	}

	@Delete("kb-builder/sources/:id")
	@ApiOperation({ summary: "Delete a crawl source" })
	async deleteKbBuilderSource(@Param("id") id: string) {
		return await this.workersService.deleteKbBuilderSource(id);
	}

	@Get("kb-builder/logs/stream")
	@ApiOperation({ summary: "SSE stream of KB Builder logs" })
	async kbBuilderLogStream(@Res() res: Response) {
		this.workersService.proxyKbBuilderSSE(res);
	}

	@Get("kb-builder/logs")
	@ApiOperation({ summary: "Get buffered KB Builder log entries" })
	async kbBuilderLogs() {
		return await this.workersService.getKbBuilderLogs();
	}

	@Delete("kb-builder/logs")
	@ApiOperation({ summary: "Clear KB Builder log buffer" })
	async clearKbBuilderLogs() {
		return await this.workersService.clearKbBuilderLogs();
	}

	@Post("kb-builder/pipeline")
	@ApiOperation({
		summary: "Trigger KB Builder pipeline (quality → summarize → ingest)",
	})
	async triggerKbPipeline() {
		return await this.workersService.triggerKbBuilderPipeline();
	}

	@Get("kb-builder/pipeline/progress")
	@ApiOperation({ summary: "Get KB Builder pipeline progress" })
	async kbBuilderPipelineProgress() {
		return await this.workersService.getKbBuilderPipelineProgress();
	}

	@Get("kb-builder/summaries")
	@ApiOperation({ summary: "Get all KB Builder summaries" })
	async kbBuilderSummaries() {
		return await this.workersService.getKbBuilderSummaries();
	}

	@Get("kb-builder/status")
	@ApiOperation({ summary: "Get full KB Builder status" })
	async kbBuilderFullStatus() {
		return await this.workersService.getKbBuilderStatus();
	}

	@Delete("kb-builder/articles/:articleId")
	@ApiOperation({ summary: "Delete an article and its summary + vectors" })
	async deleteKbBuilderArticle(@Param("articleId") articleId: string) {
		return await this.workersService.deleteKbBuilderArticle(articleId);
	}

	@Post("kb-builder/summarize")
	@ApiOperation({
		summary: "Trigger direct summarization of quality-passed articles",
	})
	async triggerSummarization() {
		return await this.workersService.triggerSummarization();
	}

	@Post("kb-builder/batch-summarize")
	@ApiOperation({ summary: "Submit batch summarization (50% cheaper via OpenAI Batch API)" })
	async submitBatchSummarization(@Body() body: Record<string, unknown>) {
		const mode = (body?.mode as string) || "new";
		return await this.workersService.submitBatchSummarization(mode);
	}

	@Get("kb-builder/batch-summarize")
	@ApiOperation({ summary: "List active batch summarization jobs" })
	async getActiveBatches() {
		return await this.workersService.getActiveBatches();
	}

	@Get("kb-builder/rag/stats")
	@ApiOperation({ summary: "Get Pinecone vector database stats" })
	async getVectorDbStats() {
		return await this.workersService.getVectorDbStats();
	}

	@Post("kb-builder/rag/ingest")
	@ApiOperation({ summary: "Trigger RAG ingestion for summarized articles" })
	async triggerRagIngestion() {
		return await this.workersService.triggerRagIngestion();
	}

	@Get("kb-builder/batch-summarize/:batchId")
	@ApiOperation({ summary: "Check batch summarization status" })
	async getBatchStatus(@Param("batchId") batchId: string) {
		return await this.workersService.getBatchSummarizationStatus(batchId);
	}

	// ─── Generic Worker Routes ───

	@Get(":slug")
	@ApiOperation({ summary: "Get worker definition and stats" })
	async getWorker(@Param("slug") slug: string) {
		const def = this.workersService.getDefinition(slug);
		if (!def) {
			return { error: { code: "NOT_FOUND", message: `Worker ${slug} not found` } };
		}

		let stats = null;
		let kbBuilderStatus = null;

		if (slug === "kb-builder") {
			kbBuilderStatus = await this.workersService.getKbBuilderStatus();
		} else {
			stats = await this.workersService.getQueueStats(slug);
		}

		return { data: { ...def, stats, kbBuilderStatus } };
	}

	@Get(":slug/jobs")
	@ApiOperation({ summary: "List jobs for a worker queue" })
	@ApiQuery({
		name: "status",
		required: false,
		enum: ["waiting", "active", "completed", "failed", "delayed"],
	})
	@ApiQuery({ name: "start", required: false })
	@ApiQuery({ name: "end", required: false })
	async getJobs(
		@Param("slug") slug: string,
		@Query("status") status: "waiting" | "active" | "completed" | "failed" | "delayed" = "completed",
		@Query("start") start?: string,
		@Query("end") end?: string,
	) {
		const jobs = await this.workersService.getJobs(
			slug,
			status,
			start ? Number(start) : 0,
			end ? Number(end) : 49,
		);
		return { data: jobs };
	}

	@Get(":slug/jobs/:jobId/logs")
	@ApiOperation({ summary: "Get logs for a specific job" })
	async getJobLogs(@Param("slug") slug: string, @Param("jobId") jobId: string) {
		const result = await this.workersService.getJobLogs(slug, jobId);
		return { data: result };
	}

	@Post(":slug/trigger")
	@ApiOperation({ summary: "Manually trigger a worker job" })
	async triggerJob(
		@Param("slug") slug: string,
		@Body() body: Record<string, unknown>,
	) {
		if (slug === "kb-builder") {
			const result = await this.workersService.triggerKbBuilder();
			return { data: result };
		}

		const result = await this.workersService.addJob(slug, body);
		if (!result) {
			return {
				error: { code: "NOT_FOUND", message: `Queue ${slug} not found` },
			};
		}
		return { data: result };
	}

	@Post(":slug/pause")
	@ApiOperation({ summary: "Pause a worker queue" })
	async pauseQueue(@Param("slug") slug: string) {
		const ok = await this.workersService.pauseQueue(slug);
		return { data: { paused: ok } };
	}

	@Post(":slug/resume")
	@ApiOperation({ summary: "Resume a worker queue" })
	async resumeQueue(@Param("slug") slug: string) {
		const ok = await this.workersService.resumeQueue(slug);
		return { data: { resumed: ok } };
	}

	@Delete(":slug/clean/:status")
	@ApiOperation({ summary: "Clean completed or failed jobs from a queue" })
	async cleanQueue(
		@Param("slug") slug: string,
		@Param("status") status: "completed" | "failed",
	) {
		const removed = await this.workersService.cleanQueue(slug, status);
		return { data: { removed } };
	}

	@Post(":slug/retry")
	@ApiOperation({ summary: "Retry all failed jobs in a queue" })
	async retryFailed(@Param("slug") slug: string) {
		const count = await this.workersService.retryFailedJobs(slug);
		return { data: { retried: count } };
	}
}
