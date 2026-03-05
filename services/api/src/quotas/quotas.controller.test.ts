import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuotasController } from './quotas.controller';
import { QuotaService } from './quotas.service';

describe('QuotasController', () => {
  let controller: QuotasController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      check: vi.fn().mockResolvedValue({
        allowed: true,
        remainingCalls: 4000,
        totalLimit: 5000,
        used: 1000,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuotasController],
      providers: [{ provide: QuotaService, useValue: service }],
    }).compile();

    controller = module.get<QuotasController>(QuotasController);
  });

  describe('getQuotaStatus', () => {
    it('should return quota status in data envelope', async () => {
      const result = await controller.getQuotaStatus('t1');
      expect(result).toEqual({
        data: {
          allowed: true,
          remainingCalls: 4000,
          totalLimit: 5000,
          used: 1000,
        },
      });
      expect(service.check).toHaveBeenCalledWith('t1');
    });
  });
});
