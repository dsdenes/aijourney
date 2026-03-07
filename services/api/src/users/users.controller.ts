import { updateUserSchema } from '@aijourney/shared';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrgRoles } from '../common/decorators/org-roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
@ApiBearerAuth()
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @OrgRoles('admin')
  @ApiOperation({ summary: 'List users in the current tenant' })
  async list(@TenantId() tenantId: string) {
    const users = await this.usersService.listByTenant(tenantId);
    return { data: users };
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get user by ID' })
  async getOne(
    @Param('id') id: string,
    @CurrentUser()
    currentUser: {
      userId: string;
      tenantId: string;
      globalRole: string;
    },
  ) {
    const user = await this.usersService.getById(id);

    if (
      currentUser.userId !== id &&
      currentUser.globalRole !== 'superadmin' &&
      currentUser.tenantId !== user.tenantId
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return { data: user };
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Update user profile' })
  async update(
    @Param('id') id: string,
    @CurrentUser()
    currentUser: {
      userId: string;
      tenantId: string;
      globalRole: string;
      orgRole: string;
    },
    @Body(new ZodValidationPipe(updateUserSchema)) body: unknown,
  ) {
    const targetUser = await this.usersService.getById(id);
    const updates = body as Record<string, unknown>;
    const isSelf = currentUser.userId === id;
    const isSuperadmin = currentUser.globalRole === 'superadmin';
    const isTenantAdmin = currentUser.orgRole === 'admin' && currentUser.tenantId === targetUser.tenantId;

    if (!isSelf && !isSuperadmin && !isTenantAdmin) {
      throw new ForbiddenException('Insufficient permissions');
    }

    if (isSelf && !isSuperadmin) {
      for (const forbiddenField of ['tenantId', 'orgRole', 'globalRole', 'role']) {
        delete updates[forbiddenField];
      }
    }

    if (isTenantAdmin && !isSuperadmin) {
      if (targetUser.globalRole === 'superadmin') {
        throw new ForbiddenException('Superadmins can only be managed in the super admin panel');
      }

      delete updates['tenantId'];
      delete updates['globalRole'];
    }

    const user = await this.usersService.update(id, updates);
    return { data: user };
  }

  @Post(':id/promote')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @OrgRoles('admin')
  @ApiOperation({ summary: 'Promote user to tenant admin' })
  @ApiBody({ schema: { type: 'object', properties: {} } })
  async promote(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: { userId: string },
  ) {
    if (currentUser.userId === id) {
      throw new ForbiddenException('You already manage this tenant');
    }

    const targetUser = await this.usersService.getById(id);
    if (targetUser.tenantId !== tenantId || targetUser.globalRole === 'superadmin') {
      throw new ForbiddenException('User is outside your tenant scope');
    }

    const user = await this.usersService.update(id, { orgRole: 'admin' as const });
    return { data: user };
  }

  @Post(':id/revoke')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @OrgRoles('admin')
  @ApiOperation({ summary: 'Revoke tenant admin rights' })
  @ApiBody({ schema: { type: 'object', properties: {} } })
  async revoke(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: { userId: string },
  ) {
    if (currentUser.userId === id) {
      throw new ForbiddenException('You cannot revoke your own tenant admin role here');
    }

    const targetUser = await this.usersService.getById(id);
    if (targetUser.tenantId !== tenantId || targetUser.globalRole === 'superadmin') {
      throw new ForbiddenException('User is outside your tenant scope');
    }

    const user = await this.usersService.update(id, { orgRole: 'member' as const });
    return { data: user };
  }
}
