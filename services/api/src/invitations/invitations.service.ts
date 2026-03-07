import type { CreateInvitationInput, Invitation, OrgRole } from '@aijourney/shared';
import { generateId, nowISO } from '@aijourney/shared';
import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { EmailService } from '../common/email/email.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { InvitationsRepository } from './invitations.repository';

const INVITE_EXPIRY_DAYS = 7;

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    @Inject(InvitationsRepository)
    private readonly repo: InvitationsRepository,
    @Inject(TenantsService)
    private readonly tenantsService: TenantsService,
    @Inject(UsersService)
    private readonly usersService: UsersService,
    @Inject(EmailService)
    private readonly emailService: EmailService,
  ) {}

  /**
   * Create a single invitation.
   */
  async create(
    tenantId: string,
    invitedBy: string,
    input: CreateInvitationInput,
  ): Promise<Invitation> {
    const email = input.email.toLowerCase();

    // Check for duplicate pending invitation
    const existing = await this.repo.getByEmailAndTenant(email, tenantId);
    if (existing) {
      throw new ConflictException(`Pending invitation already exists for ${email}`);
    }

    const now = nowISO();
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const invitation: Invitation = {
      id: generateId(),
      tenantId,
      email,
      orgRole: input.orgRole || 'member',
      invitedBy,
      status: 'pending',
      token: randomBytes(32).toString('hex'),
      expiresAt,
      createdAt: now,
    };

    const created = await this.repo.create(invitation);
    this.logger.log(
      `Invitation created for ${email} to tenant ${tenantId} (role: ${invitation.orgRole})`,
    );

    try {
      const tenant = await this.tenantsService.getById(tenantId);
      await this.emailService.sendInvitationEmail({
        email,
        tenantName: tenant.name,
        orgRole: invitation.orgRole,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown email delivery error';
      this.logger.error(`Failed to send invitation email to ${email}: ${message}`);
    }

    return created;
  }

  /**
   * Bulk invite multiple emails.
   */
  async bulkInvite(
    tenantId: string,
    invitedBy: string,
    emails: string[],
    orgRole: OrgRole = 'member',
  ): Promise<{ created: Invitation[]; skipped: string[] }> {
    const created: Invitation[] = [];
    const skipped: string[] = [];

    for (const email of emails) {
      try {
        const inv = await this.create(tenantId, invitedBy, {
          email,
          orgRole,
        });
        created.push(inv);
      } catch {
        skipped.push(email);
      }
    }

    return { created, skipped };
  }

  /**
   * List invitations for a tenant.
   */
  async listByTenant(tenantId: string): Promise<Invitation[]> {
    return this.repo.getByTenant(tenantId);
  }

  /**
   * Revoke a pending invitation.
   */
  async revoke(invitationId: string, tenantId: string): Promise<void> {
    const inv = await this.repo.getById(invitationId);
    if (!inv) throw new NotFoundException('Invitation not found');
    if (inv.tenantId !== tenantId) {
      throw new ForbiddenException('Invitation belongs to another tenant');
    }
    if (inv.status !== 'pending') {
      throw new ConflictException('Only pending invitations can be revoked');
    }
    await this.repo.updateStatus(invitationId, 'revoked');
  }

  /**
   * Preview an invitation by token (public — used to show invite details before accepting).
   */
  async getByToken(token: string): Promise<{
    invitation: Invitation;
    isValid: boolean;
    reason?: string;
  }> {
    const inv = await this.repo.getByToken(token);
    if (!inv) throw new NotFoundException('Invitation not found');

    if (inv.status !== 'pending') {
      return {
        invitation: inv,
        isValid: false,
        reason: `Invitation is ${inv.status}`,
      };
    }
    if (new Date(inv.expiresAt) < new Date()) {
      await this.repo.updateStatus(inv.id, 'expired');
      return {
        invitation: { ...inv, status: 'expired' },
        isValid: false,
        reason: 'Invitation has expired',
      };
    }

    return { invitation: inv, isValid: true };
  }

  /**
   * Accept an invitation — mark as accepted.
   * The auth service calls this during login to join the user to the tenant.
   */
  async accept(invitationId: string): Promise<Invitation> {
    const inv = await this.repo.getById(invitationId);
    if (!inv) throw new NotFoundException('Invitation not found');
    if (inv.status !== 'pending') {
      throw new GoneException(`Invitation is ${inv.status}`);
    }
    if (new Date(inv.expiresAt) < new Date()) {
      await this.repo.updateStatus(inv.id, 'expired');
      throw new GoneException('Invitation has expired');
    }

    await this.repo.updateStatus(invitationId, 'accepted', {
      acceptedAt: nowISO(),
    });
    return { ...inv, status: 'accepted', acceptedAt: nowISO() };
  }

  async acceptForUser(invitationId: string, userId: string): Promise<Invitation> {
    const invitation = await this.getById(invitationId);
    const user = await this.usersService.getById(userId);

    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException('Invitation email does not match the authenticated user');
    }

    await this.usersService.assignTenantMembership(
      user.id,
      invitation.tenantId,
      invitation.orgRole,
      {
        makeActive: !user.tenantId,
      },
    );

    return this.accept(invitationId);
  }

  async getById(invitationId: string): Promise<Invitation> {
    const invitation = await this.repo.getById(invitationId);
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    return invitation;
  }

  /**
   * Find pending invitations for an email (across all tenants).
   * Used during login to auto-join a new user.
   */
  async findPendingForEmail(email: string): Promise<Invitation[]> {
    return this.repo.getByEmail(email.toLowerCase());
  }

  /**
   * Cleanup expired invitations.
   */
  async cleanupExpired(): Promise<number> {
    return this.repo.deleteExpired();
  }
}
