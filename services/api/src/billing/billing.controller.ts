import type { TenantPlan } from "@aijourney/shared";
import {
	Body,
	Controller,
	Headers,
	Inject,
	Post,
	type RawBodyRequest,
	Req,
	UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RolesGuard } from "../auth/roles.guard";
import { OrgRoles } from "../common/decorators/org-roles.decorator";
import { TenantId } from "../common/decorators/tenant-id.decorator";
import { BillingService } from "./billing.service";

@ApiTags("billing")
@Controller("billing")
export class BillingController {
	constructor(
		@Inject(BillingService) private readonly billingService: BillingService,
	) {}

	@Post("checkout")
	@UseGuards(AuthGuard("jwt"), RolesGuard)
	@OrgRoles("owner", "admin")
	@ApiBearerAuth()
	@ApiOperation({
		summary: "Create a Stripe Checkout session for plan upgrade",
	})
	@ApiBody({
		schema: {
			type: "object",
			properties: {
				plan: { type: "string", enum: ["pro", "enterprise"] },
				successUrl: { type: "string" },
				cancelUrl: { type: "string" },
			},
			required: ["plan", "successUrl", "cancelUrl"],
		},
	})
	async createCheckout(
		@TenantId() tenantId: string,
		@Body() body: { plan: TenantPlan; successUrl: string; cancelUrl: string },
	) {
		const result = await this.billingService.createCheckoutSession(
			tenantId,
			body.plan,
			body.successUrl,
			body.cancelUrl,
		);
		return { data: result };
	}

	@Post("llm-packs")
	@UseGuards(AuthGuard("jwt"), RolesGuard)
	@OrgRoles("owner", "admin")
	@ApiBearerAuth()
	@ApiOperation({ summary: "Purchase additional LLM call packs" })
	@ApiBody({
		schema: {
			type: "object",
			properties: {
				quantity: { type: "number", minimum: 1 },
				successUrl: { type: "string" },
				cancelUrl: { type: "string" },
			},
			required: ["quantity", "successUrl", "cancelUrl"],
		},
	})
	async purchaseLlmPacks(
		@TenantId() tenantId: string,
		@Body() body: { quantity: number; successUrl: string; cancelUrl: string },
	) {
		const result = await this.billingService.createLlmPackCheckout(
			tenantId,
			body.quantity,
			body.successUrl,
			body.cancelUrl,
		);
		return { data: result };
	}

	@Post("portal")
	@UseGuards(AuthGuard("jwt"), RolesGuard)
	@OrgRoles("owner", "admin")
	@ApiBearerAuth()
	@ApiOperation({ summary: "Create a Stripe Customer Portal session" })
	@ApiBody({
		schema: {
			type: "object",
			properties: {
				returnUrl: { type: "string" },
			},
			required: ["returnUrl"],
		},
	})
	async createPortal(
		@TenantId() tenantId: string,
		@Body() body: { returnUrl: string },
	) {
		const result = await this.billingService.createPortalSession(
			tenantId,
			body.returnUrl,
		);
		return { data: result };
	}

	@Post("webhook")
	@ApiOperation({ summary: "Stripe webhook endpoint" })
	async handleWebhook(
		@Req() req: RawBodyRequest<Request>,
		@Headers("stripe-signature") signature: string,
	) {
		const rawBody = (req as unknown as { rawBody: Buffer }).rawBody;
		await this.billingService.handleWebhook(rawBody, signature);
		return { received: true };
	}
}
