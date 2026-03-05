import {
	type MiddlewareConsumer,
	Module,
	type NestModule,
} from "@nestjs/common";
import { AgentRunsModule } from "./agent-runs/agent-runs.module";
import { AiPlannerModule } from "./ai-planner/ai-planner.module";
import { ArticleRecsModule } from "./article-recs/article-recs.module";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { ChatModule } from "./chat/chat.module";
import { TenantContextMiddleware } from "./common/middleware/tenant-context.middleware";
import { CompanyContextModule } from "./company-context/company-context.module";
import { ConfigModule } from "./config/config.module";
import { HealthModule } from "./health/health.module";
import { InvitationsModule } from "./invitations/invitations.module";
import { JourneysModule } from "./journeys/journeys.module";
import { MemoryModule } from "./memory/memory.module";
import { MongoDBModule } from "./mongodb/mongodb.module";
import { PromptOptimizerModule } from "./prompt-optimizer/prompt-optimizer.module";
import { QuotasModule } from "./quotas/quotas.module";
import { RunsModule } from "./runs/runs.module";
import { SuperAdminModule } from "./superadmin/superadmin.module";
import { TenantsModule } from "./tenants/tenants.module";
import { UsersModule } from "./users/users.module";
import { WorkersModule } from "./workers/workers.module";

@Module({
	imports: [
		ConfigModule,
		MongoDBModule,
		HealthModule,
		AuthModule,
		UsersModule,
		TenantsModule,
		InvitationsModule,
		BillingModule,
		JourneysModule,
		RunsModule,
		WorkersModule,
		AgentRunsModule,
		ChatModule,
		PromptOptimizerModule,
		AiPlannerModule,
		MemoryModule,
		QuotasModule,
		SuperAdminModule,
		ArticleRecsModule,
		CompanyContextModule,
	],
})
export class AppModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(TenantContextMiddleware)
			.exclude("health", "auth/token", "auth/google/*path", "billing/webhook")
			.forRoutes("*");
	}
}
