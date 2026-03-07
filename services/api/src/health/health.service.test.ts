import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppConfigService } from '../config/config.service';
import { MONGODB_DB } from '../mongodb/mongodb.module';
import { WorkersService } from '../workers/workers.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let mockDb: { command: ReturnType<typeof vi.fn> };
  let mockWorkers: {
    pingRedis: ReturnType<typeof vi.fn>;
    getKbBuilderHealth: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockDb = { command: vi.fn() };
    mockWorkers = {
      pingRedis: vi.fn(),
      getKbBuilderHealth: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: MONGODB_DB,
          useValue: mockDb,
        },
        {
          provide: AppConfigService,
          useValue: {
            version: '0.1.0',
          },
        },
        {
          provide: WorkersService,
          useValue: mockWorkers,
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should return ok when all dependencies are connected', async () => {
    mockDb.command.mockResolvedValue({ ok: 1 });
    mockWorkers.pingRedis.mockResolvedValue(true);
    mockWorkers.getKbBuilderHealth.mockResolvedValue({ status: 'ok' });

    const result = await service.getReadiness();

    expect(result.status).toBe('ok');
    expect(result.checks.mongodb).toBe('up');
    expect(result.checks.redis).toBe('up');
    expect(result.checks.kbBuilder).toBe('up');
    expect(result.timestamp).toBeDefined();
  });

  it('should return degraded when mongodb is disconnected', async () => {
    mockDb.command.mockRejectedValue(new Error('Connection refused'));
    mockWorkers.pingRedis.mockResolvedValue(true);
    mockWorkers.getKbBuilderHealth.mockResolvedValue({ status: 'ok' });

    const result = await service.getReadiness();

    expect(result.status).toBe('degraded');
    expect(result.checks.mongodb).toBe('down');
  });

  it('should return degraded when redis or kb-builder are unavailable', async () => {
    mockDb.command.mockResolvedValue({ ok: 1 });
    mockWorkers.pingRedis.mockResolvedValue(false);
    mockWorkers.getKbBuilderHealth.mockResolvedValue({ data: { status: 'offline' } });

    const result = await service.getReadiness();

    expect(result.status).toBe('degraded');
    expect(result.checks.redis).toBe('down');
    expect(result.checks.kbBuilder).toBe('down');
  });

  it('should return liveness metadata', () => {
    const result = service.getLiveness();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('api');
    expect(result.version).toBe('0.1.0');
  });
});
