import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Readiness check' })
  async check(@Res({ passthrough: true }) response: Response) {
    const report = await this.healthService.getReadiness();
    response.status(report.status === 'ok' ? 200 : 503);
    return report;
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check' })
  async ready(@Res({ passthrough: true }) response: Response) {
    const report = await this.healthService.getReadiness();
    response.status(report.status === 'ok' ? 200 : 503);
    return report;
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness check' })
  live() {
    return this.healthService.getLiveness();
  }
}
