import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { MemoryService } from '../memory/memory.service';
import { PromptOptimizerService } from './prompt-optimizer.service';

@ApiTags('prompt-optimizer')
@Controller('prompt-optimizer')
export class PromptOptimizerController {
  constructor(
    @Inject(PromptOptimizerService)
    private readonly service: PromptOptimizerService,
    @Inject(MemoryService)
    private readonly memoryService: MemoryService,
  ) {}

  @Post('analyze')
  @ApiOperation({ summary: 'Analyze prompt quality and suggest goals' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: ['prompt'],
    },
  })
  async analyze(@Body() body: { prompt: string; userId?: string }, @TenantId() tenantId: string) {
    const result = await this.service.analyzePrompt(body.prompt, tenantId);

    // Fire-and-forget memory extraction
    if (body.userId) {
      this.memoryService
        .enqueueExtraction(body.userId, 'prompt-optimizer', body.prompt.trim())
        .catch(() => {});
    }

    return { data: result };
  }

  @Post('optimize')
  @ApiOperation({ summary: 'Optimize a prompt for a chosen goal' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        goal: { type: 'string' },
      },
      required: ['prompt', 'goal'],
    },
  })
  async optimize(
    @Body() body: { prompt: string; goal: string; userId?: string },
    @TenantId() tenantId: string,
  ) {
    const result = await this.service.optimizePrompt(body.prompt, body.goal, tenantId);

    // Fire-and-forget memory extraction (include goal for context)
    if (body.userId) {
      const memoryInput = `Prompt: ${body.prompt.trim()}\nGoal: ${body.goal.trim()}`;
      this.memoryService
        .enqueueExtraction(body.userId, 'prompt-optimizer', memoryInput)
        .catch(() => {});
    }

    return { data: result };
  }
}
