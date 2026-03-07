import { Body, Controller, Get, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../auth/roles.guard';
import { GlobalRoles } from '../common/decorators/global-roles.decorator';
import { SuperAdminService } from './superadmin.service';

@ApiTags('superadmin')
@Controller('superadmin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@GlobalRoles('superadmin')
@ApiBearerAuth()
export class SuperAdminController {
  constructor(
    @Inject(SuperAdminService)
    private readonly superAdminService: SuperAdminService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get platform-wide statistics' })
  async getPlatformStats() {
    const stats = await this.superAdminService.getPlatformStats();
    return { data: stats };
  }

  @Get('tenants')
  @ApiOperation({ summary: 'List all tenants with details' })
  async listTenants() {
    const tenants = await this.superAdminService.listAllTenants();
    return { data: tenants };
  }

  @Get('users')
  @ApiOperation({ summary: 'List all users across all tenants' })
  async listUsers() {
    const users = await this.superAdminService.listAllUsers();
    return { data: users };
  }

  @Get('tenants/:tenantId')
  @ApiOperation({ summary: 'Get detailed dashboard for a specific tenant' })
  async getTenantDashboard(@Param('tenantId') tenantId: string) {
    const dashboard = await this.superAdminService.getTenantDashboard(tenantId);
    return { data: dashboard };
  }

  @Put('tenants/:tenantId/plan')
  @ApiOperation({ summary: "Override a tenant's plan" })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        plan: { type: 'string', enum: ['free', 'pro', 'enterprise'] },
      },
      required: ['plan'],
    },
  })
  async updatePlan(
    @Param('tenantId') tenantId: string,
    @Body() body: { plan: 'free' | 'pro' | 'enterprise' },
  ) {
    await this.superAdminService.updateTenantPlan(tenantId, body.plan);
    return { data: { message: 'Plan updated' } };
  }

  @Post('users/:userId/promote')
  @ApiOperation({ summary: 'Promote a user to superadmin' })
  async promoteUser(@Param('userId') userId: string) {
    await this.superAdminService.promoteToSuperadmin(userId);
    return { data: { message: 'User promoted to superadmin' } };
  }

  @Post('users/:userId/demote')
  @ApiOperation({ summary: 'Demote a user from superadmin' })
  async demoteUser(@Param('userId') userId: string) {
    await this.superAdminService.demoteFromSuperadmin(userId);
    return { data: { message: 'User demoted from superadmin' } };
  }
}
