import { Module } from "@nestjs/common";
import { AgentRunsModule } from "./agent-runs/agent-runs.module";
import { AiPlannerModule } from "./ai-planner/ai-planner.module";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { ConfigModule } from "./config/config.module";
import { DynamoDBModule } from "./dynamodb/dynamodb.module";
import { HealthModule } from "./health/health.module";
import { JourneysModule } from "./journeys/journeys.module";
import { PromptOptimizerModule } from "./prompt-optimizer/prompt-optimizer.module";
import { RunsModule } from "./runs/runs.module";
import { UsersModule } from "./users/users.module";
import { WorkersModule } from "./workers/workers.module";

@Module({
	imports: [
		ConfigModule,
		DynamoDBModule,
		HealthModule,
		AuthModule,
		UsersModule,
		JourneysModule,
		RunsModule,
		WorkersModule,
		AgentRunsModule,
		ChatModule,
		PromptOptimizerModule,
		AiPlannerModule,
	],
})
export class AppModule {}
