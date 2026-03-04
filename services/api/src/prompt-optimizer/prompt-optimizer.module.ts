import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { MemoryModule } from "../memory/memory.module";
import { QuotasModule } from "../quotas/quotas.module";
import { PromptOptimizerController } from "./prompt-optimizer.controller";
import { PromptOptimizerService } from "./prompt-optimizer.service";

@Module({
	imports: [ConfigModule, MemoryModule, QuotasModule],
	controllers: [PromptOptimizerController],
	providers: [PromptOptimizerService],
})
export class PromptOptimizerModule {}
