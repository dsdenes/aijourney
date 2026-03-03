import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import * as jwksRsa from "jwks-rsa";
import {
	ExtractJwt,
	Strategy,
	type StrategyOptionsWithoutRequest,
} from "passport-jwt";
import { AppConfigService } from "../config/config.service";
import { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
	private readonly logger = new Logger(JwtStrategy.name);

	constructor(
		@Inject(AppConfigService) private readonly configService: AppConfigService,
		@Inject(AuthService) private readonly authService: AuthService,
		@Inject(UsersService) private readonly usersService: UsersService,
	) {
		const cognitoIssuer = configService.config.COGNITO_ISSUER;

		const opts: StrategyOptionsWithoutRequest = {
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: configService.isDevelopment,
			// In dev mode without Cognito, accept any algorithm
			...(cognitoIssuer
				? {
						issuer: cognitoIssuer,
						algorithms: ["RS256"],
						secretOrKeyProvider: jwksRsa.passportJwtSecret({
							cache: true,
							rateLimit: true,
							jwksRequestsPerMinute: 5,
							jwksUri: `${cognitoIssuer}/.well-known/jwks.json`,
						}),
					}
				: {
						secretOrKey: "dev-secret-not-for-production",
						algorithms: ["HS256"],
					}),
		};
		super(opts);
	}

	async validate(
		payload: Record<string, unknown>,
	): Promise<{ userId: string; email: string; role: string }> {
		const email = (payload["email"] ||
			payload["cognito:username"] ||
			"dev@mito.hu") as string;
		const domain = this.configService.config.ALLOWED_EMAIL_DOMAIN;

		if (domain && !email.endsWith(`@${domain}`)) {
			throw new UnauthorizedException(`Email domain must be @${domain}`);
		}

		// Look up the actual role from MongoDB (not from JWT claim)
		let role = "employee";
		try {
			const dbUser = await this.usersService.getByEmail(email);
			if (dbUser) {
				role = dbUser.role;
			}
		} catch {
			// User may not exist yet — will be created on token exchange
			this.logger.debug(`User ${email} not found in DB, defaulting to employee`);
		}

		return {
			userId: (payload["sub"] || "dev-user") as string,
			email,
			role,
		};
	}
}
