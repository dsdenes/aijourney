import { AGENT_TYPES } from '@aijourney/shared';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgentRunsService } from './agent-runs.service';

@ApiTags('agent-runs')
@Controller('agent-runs')
export class AgentRunsController {
  constructor(private readonly agentRunsService: AgentRunsService) {}

  @Get()
  @ApiOperation({ summary: 'List all agent runs (newest first)' })
  async listAll(@Query('agent') agent?: string) {
    if (agent && AGENT_TYPES.includes(agent as any)) {
      const runs = await this.agentRunsService.listByAgent(agent);
      return { data: runs };
    }
    const runs = await this.agentRunsService.listAll();
    return { data: runs };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get agent run by ID' })
  async getOne(@Param('id') id: string) {
    const run = await this.agentRunsService.getById(id);
    if (!run) {
      return { error: { code: 'NOT_FOUND', message: `Agent run ${id} not found` } };
    }
    return { data: run };
  }
}
