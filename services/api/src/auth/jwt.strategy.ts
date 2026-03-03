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

const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
	private readonly logger = new Logger(JwtStrategy.name);

	constructor(
		@Inject(AppConfigService) private readonly configService: AppConfigService,
		@Inject(AuthService) private readonly authService: AuthService,
		@Inject(UsersService) private readonly usersService: UsersService,
	) {
		const googleClientId = configService.config.GOOGLE_CLIENT_ID;

		const opts: StrategyOptionsWithoutRequest = {
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: configService.isDevelopment,
			...(googleClientId
				? {
						issuer: GOOGLE_ISSUER,
						audience: googleClientId,
						algorithms: ["RS256"],
						secretOrKeyProvider: jwksRsa.passportJwtSecret({
							cache: true,
							rateLimit: true,
							jwksRequestsPerMinute: 5,
							jwksUri: GOOGLE_JWKS_URI,
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
		const email = (payload["email"] || "dev@localhost") as string;

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
