import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MONGODB_DB } from '../mongodb/mongodb.module';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let mockDb: { command: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockDb = { command: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: MONGODB_DB,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should return ok when mongodb is connected', async () => {
    mockDb.command.mockResolvedValue({ ok: 1 });

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.mongodb).toBe('connected');
    expect(result.timestamp).toBeDefined();
  });

  it('should return degraded when mongodb is disconnected', async () => {
    mockDb.command.mockRejectedValue(new Error('Connection refused'));

    const result = await service.check();

    expect(result.status).toBe('degraded');
    expect(result.mongodb).toBe('disconnected');
  });
});
