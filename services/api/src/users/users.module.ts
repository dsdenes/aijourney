import { Module } from '@nestjs/common';
import { UserTenantMembershipsRepository } from './user-tenant-memberships.repository';
import { UserTenantMembershipsService } from './user-tenant-memberships.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersRepository,
    UserTenantMembershipsRepository,
    UserTenantMembershipsService,
  ],
  exports: [
    UsersService,
    UsersRepository,
    UserTenantMembershipsRepository,
    UserTenantMembershipsService,
  ],
})
export class UsersModule {}
