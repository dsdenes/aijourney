import { Module } from '@nestjs/common';
import { EmailModule } from '../common/email/email.module';
import { TenantsModule } from '../tenants/tenants.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsRepository } from './invitations.repository';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [TenantsModule, EmailModule],
  controllers: [InvitationsController],
  providers: [InvitationsService, InvitationsRepository],
  exports: [InvitationsService],
})
export class InvitationsModule {}
