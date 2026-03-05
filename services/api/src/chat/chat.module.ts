import { Module } from '@nestjs/common';
import { AgentRunsModule } from '../agent-runs/agent-runs.module';
import { CompanyContextModule } from '../company-context/company-context.module';
import { ConfigModule } from '../config/config.module';
import { MemoryModule } from '../memory/memory.module';
import { QuotasModule } from '../quotas/quotas.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [ConfigModule, AgentRunsModule, MemoryModule, QuotasModule, CompanyContextModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
