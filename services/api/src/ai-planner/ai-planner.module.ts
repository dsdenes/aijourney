import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { MemoryModule } from "../memory/memory.module";
import { QuotasModule } from "../quotas/quotas.module";
import { AiPlannerController } from "./ai-planner.controller";
import { AiPlannerService } from "./ai-planner.service";

@Module({
	imports: [ConfigModule, MemoryModule, QuotasModule],
	controllers: [AiPlannerController],
	providers: [AiPlannerService],
})
export class AiPlannerModule {}
