import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../auth/roles.guard';
import { GlobalRoles } from '../common/decorators/global-roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { MemoryService } from '../memory/memory.service';
import { ChatService, type ChatMessage } from './chat.service';

class ChatQueryDto {
  query!: string;
  history?: ChatMessage[];
  userId?: string;
}

@ApiTags('chat')
@Controller('chat')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@GlobalRoles('superadmin')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    @Inject(MemoryService)
    private readonly memoryService: MemoryService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Send a KB chat query' })
  async chat(@Body() body: ChatQueryDto, @TenantId() tenantId: string) {
    if (!body.query?.trim()) {
      return {
        error: { code: 'VALIDATION', message: 'query is required' },
      };
    }

    try {
      const result = await this.chatService.chat(body.query.trim(), body.history || [], tenantId);
      // Strip full I/O from client response (stored in agent run only)
      const { fullInput: _fi, fullOutput: _fo, ...clientResult } = result;

      // Fire-and-forget memory extraction
      if (body.userId) {
        this.memoryService
          .enqueueExtraction(body.userId, 'ai-chat', body.query.trim())
          .catch(() => {});
      }

      return { data: clientResult };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Chat failed';
      return {
        error: { code: 'CHAT_ERROR', message },
      };
    }
  }
}
