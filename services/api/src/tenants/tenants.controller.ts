import { createTenantSchema, switchTenantSchema, updateTenantSchema } from '@aijourney/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GlobalRoles } from '../common/decorators/global-roles.decorator';
import { OrgRoles } from '../common/decorators/org-roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TenantsService } from './tenants.service';
import { UsersService } from '../users/users.service';

@ApiTags('tenants')
@Controller('tenants')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class TenantsController {
  constructor(
    @Inject(TenantsService) private readonly tenantsService: TenantsService,
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new tenant (superadmin)' })
  @GlobalRoles('superadmin')
  async create(@Body(new ZodValidationPipe(createTenantSchema)) body: unknown) {
    const input = body as { name: string; slug: string; plan?: 'free' | 'pro' | 'enterprise' };
    const tenant = await this.tenantsService.create({
      name: input.name,
      slug: input.slug,
      plan: input.plan ?? 'free',
    });
    return { data: tenant };
  }

  @Get('current')
  @ApiOperation({ summary: "Get current user's tenant" })
  async getCurrent(@TenantId() tenantId: string) {
    if (!tenantId) {
      return { error: { code: 'NO_TENANT', message: 'User has no tenant' } };
    }
    const tenant = await this.tenantsService.getById(tenantId);
    return { data: tenant };
  }

  @Get('memberships')
  @ApiOperation({ summary: "List current user's tenant memberships" })
  async listMemberships(@CurrentUser() user: { userId: string }) {
    const memberships = await this.usersService.listTenantMemberships(user.userId);
    const enriched = await Promise.all(
      memberships.map(async (membership) => {
        try {
          const tenant = await this.tenantsService.getById(membership.tenantId);
          return {
            tenantId: tenant.id,
            tenantName: tenant.name,
            slug: tenant.slug,
            orgRole: membership.orgRole,
          };
        } catch {
          return null;
        }
      }),
    );

    return { data: enriched.filter((membership) => membership !== null) };
  }

  @Post('switch')
  @ApiOperation({ summary: 'Switch current user tenant context' })
  async switchTenant(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(switchTenantSchema)) body: unknown,
  ) {
    const input = body as { tenantId: string };
    const result = await this.usersService.switchActiveTenant(user.userId, input.tenantId);
    const tenant = await this.tenantsService.getById(result.tenantId);
    return {
      data: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        orgRole: result.orgRole,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tenant by ID' })
  @OrgRoles('owner', 'admin')
  async getById(@Param('id') id: string) {
    const tenant = await this.tenantsService.getById(id);
    return { data: tenant };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update tenant' })
  @OrgRoles('owner', 'admin')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTenantSchema)) body: unknown,
  ) {
    const tenant = await this.tenantsService.update(
      id,
      body as { name?: string; settings?: { displayName?: string; logoUrl?: string } },
    );
    return { data: tenant };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete tenant (owner or superadmin)' })
  @OrgRoles('owner')
  async delete(@Param('id') id: string) {
    await this.tenantsService.delete(id);
    return { data: { deleted: true } };
  }

  @Get()
  @ApiOperation({ summary: 'List all tenants (superadmin)' })
  @GlobalRoles('superadmin')
  async listAll() {
    const tenants = await this.tenantsService.listAll();
    return { data: tenants };
  }
}
