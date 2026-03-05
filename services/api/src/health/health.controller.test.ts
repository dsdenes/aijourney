import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: { check: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = {
      check: vi.fn().mockResolvedValue({
        status: 'ok',
        mongodb: 'connected',
        timestamp: '2025-01-01T00:00:00.000Z',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return health check result', async () => {
    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.mongodb).toBe('connected');
    expect(service.check).toHaveBeenCalledOnce();
  });
});
