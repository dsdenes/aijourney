import { Module } from "@nestjs/common";
import { AgentRunsModule } from "../agent-runs/agent-runs.module";
import { ConfigModule } from "../config/config.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
	imports: [ConfigModule, AgentRunsModule],
	controllers: [ChatController],
	providers: [ChatService],
})
export class ChatModule {}
