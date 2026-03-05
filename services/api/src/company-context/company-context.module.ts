import { Module } from "@nestjs/common";
import { TenantsModule } from "../tenants/tenants.module";
import { CompanyContextController } from "./company-context.controller";
import { CompanyContextRepository } from "./company-context.repository";
import { CompanyContextService } from "./company-context.service";
import { CompanyContextExtractionService } from "./company-context-extraction.service";
import { CompanyDocumentStorageService } from "./company-document-storage.service";

@Module({
	imports: [TenantsModule],
	controllers: [CompanyContextController],
	providers: [
		CompanyContextService,
		CompanyContextRepository,
		CompanyDocumentStorageService,
		CompanyContextExtractionService,
	],
	exports: [CompanyContextService],
})
export class CompanyContextModule {}
