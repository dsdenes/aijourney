import { Module } from '@nestjs/common';
import { WorkersModule } from '../workers/workers.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [WorkersModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
