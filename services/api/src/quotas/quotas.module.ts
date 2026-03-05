import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { QuotasController } from './quotas.controller';
import { QuotaService } from './quotas.service';

@Module({
  imports: [TenantsModule],
  controllers: [QuotasController],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotasModule {}
