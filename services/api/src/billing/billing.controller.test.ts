import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

describe('BillingController', () => {
  let controller: BillingController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      createCheckoutSession: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/abc' }),
      createLlmPackCheckout: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/llm' }),
      createPortalSession: vi.fn().mockResolvedValue({ url: 'https://portal.stripe.com/abc' }),
      handleWebhook: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [{ provide: BillingService, useValue: service }],
    }).compile();

    controller = module.get<BillingController>(BillingController);
  });

  describe('createCheckout', () => {
    it('should call createCheckoutSession and return url', async () => {
      const result = await controller.createCheckout('t1', {
        plan: 'pro',
        successUrl: 'http://ok',
        cancelUrl: 'http://cancel',
      });
      expect(result).toEqual({
        data: { url: 'https://checkout.stripe.com/abc' },
      });
      expect(service.createCheckoutSession).toHaveBeenCalledWith(
        't1',
        'pro',
        'http://ok',
        'http://cancel',
      );
    });
  });

  describe('purchaseLlmPacks', () => {
    it('should call createLlmPackCheckout', async () => {
      const result = await controller.purchaseLlmPacks('t1', {
        quantity: 3,
        successUrl: 'http://ok',
        cancelUrl: 'http://cancel',
      });
      expect(result).toEqual({
        data: { url: 'https://checkout.stripe.com/llm' },
      });
      expect(service.createLlmPackCheckout).toHaveBeenCalledWith(
        't1',
        3,
        'http://ok',
        'http://cancel',
      );
    });
  });

  describe('createPortal', () => {
    it('should call createPortalSession', async () => {
      const result = await controller.createPortal('t1', {
        returnUrl: 'http://return',
      });
      expect(result).toEqual({
        data: { url: 'https://portal.stripe.com/abc' },
      });
      expect(service.createPortalSession).toHaveBeenCalledWith('t1', 'http://return');
    });
  });

  describe('handleWebhook', () => {
    it('should pass rawBody and signature to service', async () => {
      const rawBody = Buffer.from('payload');
      const req = { rawBody } as unknown as any;
      const result = await controller.handleWebhook(req, 'sig_123');
      expect(result).toEqual({ received: true });
      expect(service.handleWebhook).toHaveBeenCalledWith(rawBody, 'sig_123');
    });
  });
});
