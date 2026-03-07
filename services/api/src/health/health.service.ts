import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Db } from 'mongodb';
import { AppConfigService } from '../config/config.service';
import { MONGODB_DB } from '../mongodb/mongodb.module';
import { WorkersService } from '../workers/workers.service';

type DependencyState = 'up' | 'down';

interface ReadinessReport {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  checks: {
    mongodb: DependencyState;
    redis: DependencyState;
    kbBuilder: DependencyState;
  };
  timestamp: string;
  uptimeSeconds: number;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @Inject(MONGODB_DB) private readonly db: Db,
    @Inject(AppConfigService) private readonly configService: AppConfigService,
    @Inject(WorkersService) private readonly workersService: WorkersService,
  ) {}

  getLiveness() {
    return {
      status: 'ok',
      service: 'api',
      version: this.configService.version,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async getReadiness(): Promise<ReadinessReport> {
    const checks: ReadinessReport['checks'] = {
      mongodb: 'down',
      redis: 'down',
      kbBuilder: 'down',
    };

    try {
      await this.db.command({ ping: 1 });
      checks.mongodb = 'up';
    } catch (error) {
      this.logger.warn('MongoDB health check failed', error);
    }

    checks.redis = (await this.workersService.pingRedis()) ? 'up' : 'down';

    const kbHealth = await this.workersService.getKbBuilderHealth();
    const kbStatus =
      (kbHealth['status'] as string | undefined) ||
      (kbHealth['data'] as Record<string, unknown> | undefined)?.status;
    checks.kbBuilder = kbStatus === 'ok' ? 'up' : 'down';

    const allHealthy = Object.values(checks).every((value) => value === 'up');

    return {
      status: allHealthy ? 'ok' : 'degraded',
      service: 'api',
      version: this.configService.version,
      checks,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async check() {
    return this.getReadiness();
  }
}
