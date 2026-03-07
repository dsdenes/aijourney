import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantBootstrapService } from './tenant-bootstrap.service';
import { TenantsRepository } from './tenants.repository';
import { TenantsService } from './tenants.service';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, TenantsRepository, TenantBootstrapService],
  exports: [TenantsService, TenantsRepository],
})
export class TenantsModule {}
