import { Module } from "@nestjs/common";
import { AgentRunsController } from "./agent-runs.controller";
import { AgentRunsRepository } from "./agent-runs.repository";
import { AgentRunsService } from "./agent-runs.service";

@Module({
	controllers: [AgentRunsController],
	providers: [AgentRunsRepository, AgentRunsService],
	exports: [AgentRunsService, AgentRunsRepository],
})
export class AgentRunsModule {}
