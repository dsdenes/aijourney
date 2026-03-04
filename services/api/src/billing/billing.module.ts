import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantsModule } from "../tenants/tenants.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({
	imports: [TenantsModule, AuthModule],
	controllers: [BillingController],
	providers: [BillingService],
	exports: [BillingService],
})
export class BillingModule {}
