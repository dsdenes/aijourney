import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: {
    getReadiness: ReturnType<typeof vi.fn>;
    getLiveness: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      getReadiness: vi.fn().mockResolvedValue({
        status: 'ok',
        checks: { mongodb: 'up', redis: 'up', kbBuilder: 'up' },
        service: 'api',
        version: '0.1.0',
        uptimeSeconds: 12,
        timestamp: '2025-01-01T00:00:00.000Z',
      }),
      getLiveness: vi.fn().mockReturnValue({
        status: 'ok',
        service: 'api',
        version: '0.1.0',
        uptimeSeconds: 12,
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

  it('should return readiness report', async () => {
    const response = { status: vi.fn() } as unknown as import('express').Response;
    const result = await controller.check(response);

    expect(result.status).toBe('ok');
    expect(result.checks.mongodb).toBe('up');
    expect(service.getReadiness).toHaveBeenCalledOnce();
  });

  it('should return liveness report', () => {
    const result = controller.live();

    expect(result.status).toBe('ok');
    expect(service.getLiveness).toHaveBeenCalledOnce();
  });
});
