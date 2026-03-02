import {
	type CanActivate,
	type ExecutionContext,
	ForbiddenException,
	Inject,
	Injectable,
} from "@nestjs/common";
import { AppConfigService } from "../config/config.service";

@Injectable()
export class DomainGuard implements CanActivate {
	constructor(@Inject(AppConfigService) private configService: AppConfigService) {}

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest();
		const user = request.user;

		if (!user?.email) {
			throw new ForbiddenException("No email found in token");
		}

		const domain = this.configService.config.ALLOWED_EMAIL_DOMAIN;
		if (domain && !user.email.endsWith(`@${domain}`)) {
			throw new ForbiddenException(`Only @${domain} emails are allowed`);
		}

		return true;
	}
}
