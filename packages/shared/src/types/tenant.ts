export const TENANT_PLANS = ["free", "pro", "enterprise"] as const;
export type TenantPlan = (typeof TENANT_PLANS)[number];

export interface TenantSettings {
	displayName?: string;
	logoUrl?: string;
}

export interface TenantQuotas {
	/** Plan-based: 3 / 25 / unlimited (-1) */
	maxUsers: number;
	/** Plan-based: 100 / 5,000 / 50,000 */
	maxLlmCallsPerMonth: number;
	/** Purchased add-on packs (cumulative, depleted on use after plan quota) */
	additionalLlmCalls: number;
}

export interface TenantUsage {
	/** ISO date — Stripe billing period start */
	currentPeriodStart: string;
	/** LLM calls consumed this period */
	llmCallsUsed: number;
	/** ISO date — last reset */
	lastResetAt: string;
}

export const PLAN_LIMITS: Record<
	TenantPlan,
	{
		maxUsers: number;
		maxLlmCallsPerMonth: number;
		hasKbBuilder: boolean;
		hasPrioritySupport: boolean;
	}
> = {
	free: {
		maxUsers: 3,
		maxLlmCallsPerMonth: 100,
		hasKbBuilder: false,
		hasPrioritySupport: false,
	},
	pro: {
		maxUsers: 25,
		maxLlmCallsPerMonth: 5_000,
		hasKbBuilder: true,
		hasPrioritySupport: true,
	},
	enterprise: {
		maxUsers: -1,
		maxLlmCallsPerMonth: 50_000,
		hasKbBuilder: true,
		hasPrioritySupport: true,
	},
};

export const LLM_CALL_PACK_SIZE = 1_000;

export interface Tenant {
	id: string;
	name: string;
	slug: string;
	plan: TenantPlan;
	stripeCustomerId?: string;
	stripeSubscriptionId?: string;
	settings: TenantSettings;
	quotas: TenantQuotas;
	usage: TenantUsage;
	/** Admin-authored free-text company description */
	companyContext?: string;
	createdAt: string;
	updatedAt: string;
}
