import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TenantId } from "../common/decorators/tenant-id.decorator";
import { QuotaService } from "./quotas.service";

@ApiTags("quotas")
@Controller("quotas")
@UseGuards(AuthGuard("jwt"))
@ApiBearerAuth()
export class QuotasController {
	constructor(
		@Inject(QuotaService)
		private readonly quotaService: QuotaService,
	) {}

	@Get("status")
	@ApiOperation({ summary: "Get current quota usage for authenticated user's tenant" })
	async getQuotaStatus(@TenantId() tenantId: string) {
		const result = await this.quotaService.check(tenantId);
		return { data: result };
	}
}
