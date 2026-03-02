import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { PromptOptimizerController } from "./prompt-optimizer.controller";
import { PromptOptimizerService } from "./prompt-optimizer.service";

@Module({
	imports: [ConfigModule],
	controllers: [PromptOptimizerController],
	providers: [PromptOptimizerService],
})
export class PromptOptimizerModule {}
