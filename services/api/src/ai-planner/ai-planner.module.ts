import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { AiPlannerController } from "./ai-planner.controller";
import { AiPlannerService } from "./ai-planner.service";

@Module({
	imports: [ConfigModule],
	controllers: [AiPlannerController],
	providers: [AiPlannerService],
})
export class AiPlannerModule {}
