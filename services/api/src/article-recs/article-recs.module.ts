import { Module } from '@nestjs/common';
import { AgentRunsModule } from '../agent-runs/agent-runs.module';
import { CompanyContextModule } from '../company-context/company-context.module';
import { ConfigModule } from '../config/config.module';
import { MemoryModule } from '../memory/memory.module';
import { UsersModule } from '../users/users.module';
import { ArticleRecsController } from './article-recs.controller';
import { ArticleRecsRepository } from './article-recs.repository';
import { ArticleRecsService } from './article-recs.service';

@Module({
  imports: [ConfigModule, UsersModule, MemoryModule, AgentRunsModule, CompanyContextModule],
  controllers: [ArticleRecsController],
  providers: [ArticleRecsService, ArticleRecsRepository],
  exports: [ArticleRecsService, ArticleRecsRepository],
})
export class ArticleRecsModule {}
