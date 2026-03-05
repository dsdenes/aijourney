import type { Tenant } from '@aijourney/shared';
import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { TenantsRepository } from '../tenants/tenants.repository';

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  remainingCalls: number;
  totalLimit: number;
  used: number;
}

/**
 * Enforces per-tenant LLM call quotas.
 * Inject this service in any module that performs LLM calls.
 *
 * Usage:
 *   await quotaService.checkAndIncrement(tenantId, 1);
 *   // If quota exceeded, throws ForbiddenException
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(
    @Inject(TenantsRepository)
    private readonly tenantsRepo: TenantsRepository,
  ) {}

  /**
   * Check if the tenant has remaining LLM call quota and increment usage.
   * Should be called BEFORE making each LLM call.
   *
   * @param tenantId - The tenant ID
   * @param calls - Number of LLM calls to consume (default: 1)
   * @throws ForbiddenException if quota is exceeded
   */
  async checkAndIncrement(tenantId: string, calls = 1): Promise<QuotaCheckResult> {
    const tenant = await this.tenantsRepo.getById(tenantId);

    if (!tenant) {
      throw new ForbiddenException('Tenant not found — cannot verify quota');
    }

    const result = this.calculateQuota(tenant);

    if (!result.allowed) {
      this.logger.warn(
        `Tenant ${tenantId} quota exceeded: ${result.used}/${result.totalLimit} LLM calls`,
      );
      throw new ForbiddenException(
        result.reason || 'LLM call quota exceeded for your organization',
      );
    }

    // Check if adding `calls` would exceed the limit
    if (result.remainingCalls < calls) {
      throw new ForbiddenException(
        `Insufficient LLM call quota. Remaining: ${result.remainingCalls}, requested: ${calls}`,
      );
    }

    // Increment usage atomically
    await this.tenantsRepo.incrementUsage(tenantId, 'llmCallsUsed', calls);

    return {
      ...result,
      used: result.used + calls,
      remainingCalls: result.remainingCalls - calls,
    };
  }

  /**
   * Check quota without incrementing. Useful for pre-flight checks in the UI.
   */
  async check(tenantId: string): Promise<QuotaCheckResult> {
    const tenant = await this.tenantsRepo.getById(tenantId);

    if (!tenant) {
      throw new ForbiddenException('Tenant not found — cannot verify quota');
    }

    return this.calculateQuota(tenant);
  }

  /**
   * Reset monthly usage for a tenant (called by billing period reset or Stripe webhook).
   */
  async resetMonthlyUsage(tenantId: string): Promise<void> {
    await this.tenantsRepo.resetUsage(tenantId);
    this.logger.log(`Monthly usage reset for tenant ${tenantId}`);
  }

  private calculateQuota(tenant: Tenant): QuotaCheckResult {
    const planLimit = tenant.quotas.maxLlmCallsPerMonth;
    const additionalCalls = tenant.quotas.additionalLlmCalls;
    const used = tenant.usage.llmCallsUsed;

    // Unlimited plan (enterprise with -1 maxLlmCallsPerMonth)
    if (planLimit === -1) {
      return {
        allowed: true,
        remainingCalls: Number.MAX_SAFE_INTEGER,
        totalLimit: -1,
        used,
      };
    }

    const totalLimit = planLimit + additionalCalls;
    const remaining = totalLimit - used;

    if (remaining <= 0) {
      return {
        allowed: false,
        reason: `LLM call quota exceeded (${used}/${totalLimit}). Upgrade your plan or purchase additional call packs.`,
        remainingCalls: 0,
        totalLimit,
        used,
      };
    }

    return {
      allowed: true,
      remainingCalls: remaining,
      totalLimit,
      used,
    };
  }
}
