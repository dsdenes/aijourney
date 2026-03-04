import type { TenantPlan } from "@aijourney/shared";
import { LLM_CALL_PACK_SIZE, PLAN_LIMITS } from "@aijourney/shared";
import {
	BadRequestException,
	Inject,
	Injectable,
	Logger,
	RawBodyRequest,
} from "@nestjs/common";
import Stripe from "stripe";
import { AppConfigService } from "../config/config.service";
import { TenantsRepository } from "../tenants/tenants.repository";

@Injectable()
export class BillingService {
	private readonly logger = new Logger(BillingService.name);
	private stripe: Stripe | null = null;

	constructor(
		@Inject(AppConfigService) private readonly configService: AppConfigService,
		@Inject(TenantsRepository) private readonly tenantsRepo: TenantsRepository,
	) {}

	private getStripe(): Stripe {
		if (!this.stripe) {
			const key = this.configService.config.STRIPE_SECRET_KEY;
			if (!key) {
				throw new BadRequestException("Stripe is not configured");
			}
			this.stripe = new Stripe(key);
		}
		return this.stripe;
	}

	/**
	 * Create a Stripe Checkout session for upgrading a tenant's plan.
	 */
	async createCheckoutSession(
		tenantId: string,
		plan: TenantPlan,
		successUrl: string,
		cancelUrl: string,
	): Promise<{ url: string }> {
		const tenant = await this.tenantsRepo.getById(tenantId);
		if (!tenant) throw new BadRequestException("Tenant not found");

		const priceId = this.getPriceIdForPlan(plan);
		if (!priceId) {
			throw new BadRequestException(`No Stripe price configured for plan: ${plan}`);
		}

		const stripe = this.getStripe();

		// Get or create Stripe customer
		let customerId = tenant.stripeCustomerId;
		if (!customerId) {
			const customer = await stripe.customers.create({
				metadata: { tenantId, tenantSlug: tenant.slug },
				name: tenant.name,
			});
			customerId = customer.id;
			await this.tenantsRepo.update(tenantId, { stripeCustomerId: customerId });
		}

		const session = await stripe.checkout.sessions.create({
			customer: customerId,
			mode: "subscription",
			line_items: [{ price: priceId, quantity: 1 }],
			success_url: successUrl,
			cancel_url: cancelUrl,
			metadata: { tenantId, plan },
		});

		return { url: session.url || "" };
	}

	/**
	 * Create a Stripe Checkout session for purchasing LLM call packs.
	 */
	async createLlmPackCheckout(
		tenantId: string,
		quantity: number,
		successUrl: string,
		cancelUrl: string,
	): Promise<{ url: string }> {
		const tenant = await this.tenantsRepo.getById(tenantId);
		if (!tenant) throw new BadRequestException("Tenant not found");

		const priceId = this.configService.config.STRIPE_LLM_PACK_PRICE_ID;
		if (!priceId) {
			throw new BadRequestException("LLM call pack price not configured");
		}

		const stripe = this.getStripe();

		let customerId = tenant.stripeCustomerId;
		if (!customerId) {
			const customer = await stripe.customers.create({
				metadata: { tenantId, tenantSlug: tenant.slug },
				name: tenant.name,
			});
			customerId = customer.id;
			await this.tenantsRepo.update(tenantId, { stripeCustomerId: customerId });
		}

		const session = await stripe.checkout.sessions.create({
			customer: customerId,
			mode: "payment",
			line_items: [{ price: priceId, quantity }],
			success_url: successUrl,
			cancel_url: cancelUrl,
			metadata: { tenantId, type: "llm_pack", quantity: String(quantity) },
		});

		return { url: session.url || "" };
	}

	/**
	 * Create a Stripe Customer Portal session for managing billing.
	 */
	async createPortalSession(
		tenantId: string,
		returnUrl: string,
	): Promise<{ url: string }> {
		const tenant = await this.tenantsRepo.getById(tenantId);
		if (!tenant?.stripeCustomerId) {
			throw new BadRequestException("No Stripe subscription found for this organization");
		}

		const stripe = this.getStripe();
		const session = await stripe.billingPortal.sessions.create({
			customer: tenant.stripeCustomerId,
			return_url: returnUrl,
		});

		return { url: session.url };
	}

	/**
	 * Handle incoming Stripe webhook events.
	 */
	async handleWebhook(payload: Buffer, signature: string): Promise<void> {
		const stripe = this.getStripe();
		const webhookSecret = this.configService.config.STRIPE_WEBHOOK_SECRET;

		if (!webhookSecret) {
			this.logger.warn("Stripe webhook secret not configured - ignoring webhook");
			return;
		}

		let event: Stripe.Event;
		try {
			event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
		} catch (err) {
			this.logger.error(`Webhook signature verification failed: ${err}`);
			throw new BadRequestException("Webhook signature verification failed");
		}

		this.logger.log(`Processing Stripe event: ${event.type}`);

		switch (event.type) {
			case "checkout.session.completed":
				await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
				break;

			case "customer.subscription.updated":
				await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
				break;

			case "customer.subscription.deleted":
				await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
				break;

			case "invoice.paid":
				await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
				break;

			default:
				this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
		}
	}

	private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
		const tenantId = session.metadata?.["tenantId"];
		if (!tenantId) return;

		// LLM pack purchase
		if (session.metadata?.["type"] === "llm_pack") {
			const quantity = Number.parseInt(session.metadata?.["quantity"] || "1", 10);
			const additionalCalls = quantity * LLM_CALL_PACK_SIZE;

			const tenant = await this.tenantsRepo.getById(tenantId);
			if (tenant) {
				await this.tenantsRepo.updateRaw(tenantId, {
					"quotas.additionalLlmCalls":
						tenant.quotas.additionalLlmCalls + additionalCalls,
				});
				this.logger.log(`Added ${additionalCalls} LLM calls to tenant ${tenantId}`);
			}
			return;
		}

		// Plan subscription checkout
		const plan = session.metadata?.["plan"] as TenantPlan | undefined;
		if (plan) {
			const limits = PLAN_LIMITS[plan];
			await this.tenantsRepo.updatePlan(tenantId, plan, {
				maxUsers: limits.maxUsers,
				maxLlmCallsPerMonth: limits.maxLlmCallsPerMonth,
			});
			const subscriptionId = (session as unknown as Record<string, unknown>).subscription as string | undefined;
			if (subscriptionId) {
				await this.tenantsRepo.update(tenantId, { stripeSubscriptionId: subscriptionId });
			}
			this.logger.log(`Tenant ${tenantId} upgraded to ${plan}`);
		}
	}

	private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
		// Find tenant by subscription ID
		const tenantId = subscription.metadata?.["tenantId"];
		if (!tenantId) return;

		if (subscription.status === "active") {
			this.logger.log(`Subscription ${subscription.id} active for tenant ${tenantId}`);
		} else if (subscription.status === "past_due") {
			this.logger.warn(`Subscription ${subscription.id} past due for tenant ${tenantId}`);
		}
	}

	private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
		const tenantId = subscription.metadata?.["tenantId"];
		if (!tenantId) return;

		// Downgrade to free plan
		const freeLimits = PLAN_LIMITS.free;
		await this.tenantsRepo.updatePlan(tenantId, "free", {
			maxUsers: freeLimits.maxUsers,
			maxLlmCallsPerMonth: freeLimits.maxLlmCallsPerMonth,
		});
		await this.tenantsRepo.update(tenantId, {
			stripeSubscriptionId: undefined,
		});
		this.logger.log(`Tenant ${tenantId} downgraded to free (subscription deleted)`);
	}

	private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
		// Reset monthly usage on invoice payment (new billing period)
		const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
		if (!customerId) return;

		// TODO: look up tenant by stripeCustomerId
		this.logger.log(`Invoice paid for customer ${customerId}`);
	}

	private getPriceIdForPlan(plan: TenantPlan): string | undefined {
		const { STRIPE_PRO_PRICE_ID, STRIPE_ENTERPRISE_PRICE_ID } = this.configService.config;
		switch (plan) {
			case "pro":
				return STRIPE_PRO_PRICE_ID || undefined;
			case "enterprise":
				return STRIPE_ENTERPRISE_PRICE_ID || undefined;
			default:
				return undefined;
		}
	}
}
