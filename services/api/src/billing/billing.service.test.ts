import { LLM_CALL_PACK_SIZE, PLAN_LIMITS } from '@aijourney/shared';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppConfigService } from '../config/config.service';
import { TenantsRepository } from '../tenants/tenants.repository';
import { BillingService } from './billing.service';

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    name: 'Test',
    slug: 'test',
    plan: 'free',
    settings: {},
    quotas: { maxUsers: 3, maxLlmCallsPerMonth: 100, additionalLlmCalls: 0 },
    usage: {
      currentPeriodStart: '2026-01-01',
      llmCallsUsed: 0,
      lastResetAt: '2026-01-01',
    },
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

describe('BillingService', () => {
  let service: BillingService;
  let tenantsRepo: Record<string, ReturnType<typeof vi.fn>>;
  let configService: { config: Record<string, string> };

  beforeEach(async () => {
    tenantsRepo = {
      getById: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      updatePlan: vi.fn().mockResolvedValue(undefined),
      updateRaw: vi.fn().mockResolvedValue(undefined),
    };

    configService = {
      config: {
        STRIPE_SECRET_KEY: '',
        STRIPE_WEBHOOK_SECRET: '',
        STRIPE_PRO_PRICE_ID: 'price_pro',
        STRIPE_ENTERPRISE_PRICE_ID: 'price_ent',
        STRIPE_LLM_PACK_PRICE_ID: 'price_llm',
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: TenantsRepository, useValue: tenantsRepo },
        { provide: AppConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  describe('getStripe (via createCheckoutSession)', () => {
    it('should throw BadRequestException when STRIPE_SECRET_KEY is empty', async () => {
      tenantsRepo.getById.mockResolvedValue(makeTenant());

      await expect(
        service.createCheckoutSession('t1', 'pro', 'http://ok', 'http://cancel'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createCheckoutSession', () => {
    it('should throw BadRequestException when tenant not found', async () => {
      configService.config.STRIPE_SECRET_KEY = 'sk_test_123';
      await expect(
        service.createCheckoutSession('missing', 'pro', 'http://ok', 'http://cancel'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject enterprise checkout because it is negotiation-only', async () => {
      configService.config.STRIPE_SECRET_KEY = 'sk_test_123';
      tenantsRepo.getById.mockResolvedValue(makeTenant());

      await expect(
        service.createCheckoutSession('t1', 'enterprise', 'http://ok', 'http://cancel'),
      ).rejects.toThrow(
        'Enterprise plan is available by negotiation only. Contact support to upgrade.',
      );
    });

    it('should throw BadRequestException for free plan (no price)', async () => {
      configService.config.STRIPE_SECRET_KEY = 'sk_test_123';
      tenantsRepo.getById.mockResolvedValue(makeTenant());

      await expect(
        service.createCheckoutSession('t1', 'free', 'http://ok', 'http://cancel'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createLlmPackCheckout', () => {
    it('should throw BadRequestException when tenant not found', async () => {
      configService.config.STRIPE_SECRET_KEY = 'sk_test_123';
      await expect(
        service.createLlmPackCheckout('missing', 1, 'http://ok', 'http://cancel'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when LLM pack price not configured', async () => {
      configService.config.STRIPE_SECRET_KEY = 'sk_test_123';
      configService.config.STRIPE_LLM_PACK_PRICE_ID = '';
      tenantsRepo.getById.mockResolvedValue(makeTenant());

      await expect(
        service.createLlmPackCheckout('t1', 1, 'http://ok', 'http://cancel'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createPortalSession', () => {
    it('should throw when no stripeCustomerId on tenant', async () => {
      configService.config.STRIPE_SECRET_KEY = 'sk_test_123';
      tenantsRepo.getById.mockResolvedValue(makeTenant());

      await expect(service.createPortalSession('t1', 'http://return')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('handleWebhook', () => {
    it('should return silently when webhook secret not configured', async () => {
      configService.config.STRIPE_SECRET_KEY = 'sk_test_123';
      configService.config.STRIPE_WEBHOOK_SECRET = '';

      // Should not throw — just logs warning and returns
      await service.handleWebhook(Buffer.from('{}'), 'sig');
    });
  });

  describe('handleCheckoutCompleted (via internal logic)', () => {
    it('should add LLM calls for llm_pack checkout', async () => {
      const tenant = makeTenant({
        quotas: {
          maxUsers: 3,
          maxLlmCallsPerMonth: 100,
          additionalLlmCalls: 500,
        },
      });
      tenantsRepo.getById.mockResolvedValue(tenant);

      // Call the private method via accessing prototype
      const handler = (service as any).handleCheckoutCompleted.bind(service);
      await handler({
        metadata: { tenantId: 't1', type: 'llm_pack', quantity: '2' },
      });

      expect(tenantsRepo.updateRaw).toHaveBeenCalledWith('t1', {
        'quotas.additionalLlmCalls': 500 + 2 * LLM_CALL_PACK_SIZE,
      });
    });

    it('should upgrade plan for subscription checkout', async () => {
      const handler = (service as any).handleCheckoutCompleted.bind(service);
      await handler({
        metadata: { tenantId: 't1', plan: 'pro' },
        subscription: 'sub_123',
      });

      expect(tenantsRepo.updatePlan).toHaveBeenCalledWith('t1', 'pro', {
        maxUsers: PLAN_LIMITS.pro.maxUsers,
        maxLlmCallsPerMonth: PLAN_LIMITS.pro.maxLlmCallsPerMonth,
      });
      expect(tenantsRepo.update).toHaveBeenCalledWith('t1', {
        stripeSubscriptionId: 'sub_123',
      });
    });

    it('should skip when no tenantId in metadata', async () => {
      const handler = (service as any).handleCheckoutCompleted.bind(service);
      await handler({ metadata: {} });

      expect(tenantsRepo.updatePlan).not.toHaveBeenCalled();
      expect(tenantsRepo.updateRaw).not.toHaveBeenCalled();
    });
  });

  describe('handleSubscriptionDeleted (via internal logic)', () => {
    it('should downgrade tenant to free plan', async () => {
      const handler = (service as any).handleSubscriptionDeleted.bind(service);
      await handler({
        metadata: { tenantId: 't1' },
        id: 'sub_123',
      });

      expect(tenantsRepo.updatePlan).toHaveBeenCalledWith('t1', 'free', {
        maxUsers: PLAN_LIMITS.free.maxUsers,
        maxLlmCallsPerMonth: PLAN_LIMITS.free.maxLlmCallsPerMonth,
      });
      expect(tenantsRepo.update).toHaveBeenCalledWith('t1', {
        stripeSubscriptionId: undefined,
      });
    });

    it('should skip when no tenantId in metadata', async () => {
      const handler = (service as any).handleSubscriptionDeleted.bind(service);
      await handler({ metadata: {} });
      expect(tenantsRepo.updatePlan).not.toHaveBeenCalled();
    });
  });

  describe('handleSubscriptionUpdated (via internal logic)', () => {
    it('should handle active subscription without error', async () => {
      const handler = (service as any).handleSubscriptionUpdated.bind(service);
      await handler({
        metadata: { tenantId: 't1' },
        id: 'sub_123',
        status: 'active',
      });
      // Just verifying it doesn't throw — logs only
    });

    it('should handle past_due subscription without error', async () => {
      const handler = (service as any).handleSubscriptionUpdated.bind(service);
      await handler({
        metadata: { tenantId: 't1' },
        id: 'sub_123',
        status: 'past_due',
      });
    });
  });

  describe('getPriceIdForPlan', () => {
    it('should return pro price ID', () => {
      const fn = (service as any).getPriceIdForPlan.bind(service);
      expect(fn('pro')).toBe('price_pro');
    });

    it('should return enterprise price ID', () => {
      const fn = (service as any).getPriceIdForPlan.bind(service);
      expect(fn('enterprise')).toBe('price_ent');
    });

    it('should return undefined for free plan', () => {
      const fn = (service as any).getPriceIdForPlan.bind(service);
      expect(fn('free')).toBeUndefined();
    });

    it('should return undefined when price not configured', () => {
      configService.config.STRIPE_PRO_PRICE_ID = '';
      const fn = (service as any).getPriceIdForPlan.bind(service);
      expect(fn('pro')).toBeUndefined();
    });
  });
});
