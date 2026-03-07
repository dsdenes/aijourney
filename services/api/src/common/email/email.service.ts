import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { AppConfigService } from '../../config/config.service';

interface InvitationEmailInput {
  email: string;
  tenantName: string;
  invitedByName?: string;
  orgRole: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(@Inject(AppConfigService) private readonly configService: AppConfigService) {}

  isConfigured(): boolean {
    const { SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL } = this.configService.config;
    return Boolean(SMTP_USER && SMTP_PASS && SMTP_FROM_EMAIL);
  }

  async sendInvitationEmail(input: InvitationEmailInput): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.warn(`SMTP is not configured; invitation email to ${input.email} was not sent`);
      return false;
    }

    const { APP_URL, SMTP_FROM_EMAIL, SMTP_FROM_NAME } = this.configService.config;
    const inviterLine = input.invitedByName
      ? `${input.invitedByName} invited you`
      : 'You were invited';
    const loginUrl = APP_URL || 'http://localhost:5173';

    await this.getTransporter().sendMail({
      from: SMTP_FROM_NAME ? `"${SMTP_FROM_NAME}" <${SMTP_FROM_EMAIL}>` : SMTP_FROM_EMAIL,
      to: input.email,
      subject: `You're invited to ${input.tenantName} on AI Journey`,
      text: [
        `${inviterLine} to join ${input.tenantName} on AI Journey as ${input.orgRole}.`,
        '',
        `Sign in with Google using ${input.email} at: ${loginUrl}`,
        '',
        'The invitation will be accepted automatically after you sign in with that email address.',
      ].join('\n'),
      html: [
        `<p>${inviterLine} to join <strong>${input.tenantName}</strong> on AI Journey as <strong>${input.orgRole}</strong>.</p>`,
        `<p><a href="${loginUrl}">Sign in with Google</a> using <strong>${input.email}</strong>.</p>`,
        '<p>The invitation will be accepted automatically after you sign in with that email address.</p>',
      ].join(''),
    });

    this.logger.log(`Invitation email sent to ${input.email}`);
    return true;
  }

  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = this.configService.config;

    this.transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    return this.transporter;
  }
}
