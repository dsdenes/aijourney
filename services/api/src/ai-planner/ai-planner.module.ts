import { Module } from "@nestjs/common";
import { CompanyContextModule } from "../company-context/company-context.module";
import { ConfigModule } from "../config/config.module";
import { MemoryModule } from "../memory/memory.module";
import { QuotasModule } from "../quotas/quotas.module";
import { AiPlannerController } from "./ai-planner.controller";
import { AiPlannerService } from "./ai-planner.service";

@Module({
	imports: [ConfigModule, MemoryModule, QuotasModule, CompanyContextModule],
	controllers: [AiPlannerController],
	providers: [AiPlannerService],
})
export class AiPlannerModule {}
