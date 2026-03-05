import { Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GlobalRoles } from '../common/decorators/global-roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { ArticleRecsService } from './article-recs.service';

@ApiTags('article-recommendations')
@Controller('article-recs')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class ArticleRecsController {
  constructor(
    @Inject(ArticleRecsService)
    private readonly recsService: ArticleRecsService,
  ) {}

  // ── User endpoints ──

  @Get('my')
  @ApiOperation({ summary: "Get current user's article recommendations" })
  async getMyRecommendations(@CurrentUser() user: { userId: string }) {
    const recs = await this.recsService.getForUser(user.userId);
    return { data: recs };
  }

  @Get('my/pending')
  @ApiOperation({ summary: "Get current user's unread recommendations" })
  async getMyPendingRecommendations(@CurrentUser() user: { userId: string }) {
    const recs = await this.recsService.getPendingForUser(user.userId);
    return { data: recs };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark a recommendation as read' })
  async markAsRead(@Param('id') id: string) {
    await this.recsService.markAsRead(id);
    return { data: { success: true } };
  }

  @Post(':id/dismiss')
  @ApiOperation({ summary: 'Dismiss a recommendation' })
  async dismiss(@Param('id') id: string) {
    await this.recsService.dismiss(id);
    return { data: { success: true } };
  }

  // ── Admin endpoints ──

  @Get('admin/stats')
  @ApiOperation({ summary: 'Get article recommendation stats (admin)' })
  @GlobalRoles('superadmin')
  async getAdminStats(@TenantId() tenantId: string) {
    const stats = await this.recsService.getAdminStats(tenantId || undefined);
    return { data: stats };
  }

  @Get('admin/batches')
  @ApiOperation({ summary: 'List recommendation batches (admin)' })
  @GlobalRoles('superadmin')
  async listBatches(@TenantId() tenantId: string) {
    const batches = await this.recsService.listBatches(tenantId || undefined);
    return { data: batches };
  }

  @Get('admin/batches/:batchId')
  @ApiOperation({ summary: 'Get recommendations for a batch (admin)' })
  @GlobalRoles('superadmin')
  async getBatchRecs(@Param('batchId') batchId: string) {
    const recs = await this.recsService.getRecsByBatch(batchId);
    return { data: recs };
  }

  @Post('admin/trigger')
  @ApiOperation({ summary: 'Trigger a recommendation batch manually (admin)' })
  @GlobalRoles('superadmin')
  async triggerBatch(@TenantId() tenantId: string) {
    const batch = await this.recsService.triggerBatch(tenantId || undefined);
    return { data: batch };
  }

  @Get('admin/queue')
  @ApiOperation({ summary: 'Get recommendation queue stats (admin)' })
  @GlobalRoles('superadmin')
  async getQueueStats() {
    const stats = await this.recsService.getQueueStats();
    return { data: stats };
  }
}
