import { Module } from "@nestjs/common";
import { AgentRunsModule } from "../agent-runs/agent-runs.module";
import { ConfigModule } from "../config/config.module";
import { MemoryModule } from "../memory/memory.module";
import { QuotasModule } from "../quotas/quotas.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
	imports: [ConfigModule, AgentRunsModule, MemoryModule, QuotasModule],
	controllers: [ChatController],
	providers: [ChatService],
})
export class ChatModule {}
