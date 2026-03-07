import { bulkInviteSchema, createInvitationSchema } from '@aijourney/shared';
import { Body, Controller, Delete, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrgRoles } from '../common/decorators/org-roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { InvitationsService } from './invitations.service';

@ApiTags('invitations')
@Controller('invitations')
@ApiBearerAuth()
export class InvitationsController {
  constructor(
    @Inject(InvitationsService)
    private readonly invitationsService: InvitationsService,
  ) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @OrgRoles('admin')
  @ApiOperation({ summary: 'Create an invitation' })
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(createInvitationSchema)) body: unknown,
  ) {
    const input = body as { email: string; orgRole?: 'admin' | 'member' };
    const invitation = await this.invitationsService.create(tenantId, user.userId, {
      email: input.email,
      orgRole: input.orgRole ?? 'member',
    });
    return { data: invitation };
  }

  @Post('bulk')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @OrgRoles('admin')
  @ApiOperation({ summary: 'Bulk invite multiple emails' })
  async bulkInvite(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(bulkInviteSchema))
    body: unknown,
  ) {
    const input = body as {
      emails: string[];
      orgRole?: 'admin' | 'member';
    };
    const result = await this.invitationsService.bulkInvite(
      tenantId,
      user.userId,
      input.emails,
      input.orgRole,
    );
    return { data: result };
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @OrgRoles('admin')
  @ApiOperation({ summary: 'List tenant invitations' })
  async list(@TenantId() tenantId: string) {
    const invitations = await this.invitationsService.listByTenant(tenantId);
    return { data: invitations };
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @OrgRoles('admin')
  @ApiOperation({ summary: 'Revoke invitation' })
  async revoke(@Param('id') id: string, @TenantId() tenantId: string) {
    await this.invitationsService.revoke(id, tenantId);
    return { data: { revoked: true } };
  }

  /**
   * Public — preview invitation details (no auth required for viewing).
   */
  @Get('accept/:token')
  @ApiOperation({ summary: 'Preview invitation (public)' })
  async preview(@Param('token') token: string) {
    const result = await this.invitationsService.getByToken(token);
    return { data: result };
  }

  /**
   * Accept invitation — requires the user to be authenticated.
   */
  @Post('accept/:token')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Accept invitation' })
  async accept(@Param('token') token: string) {
    const { invitation, isValid, reason } = await this.invitationsService.getByToken(token);
    if (!isValid) {
      return { error: { code: 'INVALID_INVITATION', message: reason } };
    }
    const accepted = await this.invitationsService.accept(invitation.id);
    return { data: accepted };
  }
}
