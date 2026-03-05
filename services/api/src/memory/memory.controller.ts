import { Controller, Delete, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MemoryService } from './memory.service';

@ApiTags('memory')
@Controller('memory')
export class MemoryController {
  constructor(@Inject(MemoryService) private readonly memoryService: MemoryService) {}

  /**
   * Get facts stored for a specific user (used by Profile page).
   */
  @Get('facts/:userId')
  @ApiOperation({ summary: 'Get memory facts for a user' })
  async getUserFacts(@Param('userId') userId: string) {
    const facts = await this.memoryService.getFactsForUser(userId);
    return { data: facts };
  }

  /**
   * Delete a specific fact (user can manage their own memory).
   */
  @Delete('facts/:userId/:factId')
  @ApiOperation({ summary: 'Delete a specific memory fact' })
  async deleteFact(@Param('userId') userId: string, @Param('factId') factId: string) {
    const deleted = await this.memoryService.deleteFactForUser(userId, factId);
    if (!deleted) {
      return { error: { code: 'NOT_FOUND', message: 'Fact not found' } };
    }
    return { data: { deleted: true } };
  }

  /**
   * Clear all memory for a user.
   */
  @Delete('facts/:userId')
  @ApiOperation({ summary: 'Clear all memory facts for a user' })
  async clearUserMemory(@Param('userId') userId: string) {
    const count = await this.memoryService.clearMemoryForUser(userId);
    return { data: { deletedCount: count } };
  }

  /**
   * Admin: Get memory system stats + queue status.
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get memory system stats (admin)' })
  async getStats() {
    const stats = await this.memoryService.getStats();
    return { data: stats };
  }

  /**
   * Admin: Get queue stats only.
   */
  @Get('queue-stats')
  @ApiOperation({ summary: 'Get memory extraction queue stats' })
  async getQueueStats() {
    const stats = await this.memoryService.getQueueStats();
    return { data: stats };
  }
}
