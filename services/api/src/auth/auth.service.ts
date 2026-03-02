import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { AppConfigService } from "../config/config.service";
import { UsersService } from "../users/users.service";

/** Emails that are automatically promoted to admin on first login */
const DEFAULT_ADMINS = ["d.pal@mito.hu"];

interface CognitoTokenResponse {
	id_token: string;
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	token_type: string;
}

interface TokenPayload {
	sub: string;
	email: string;
	name?: string;
	"cognito:username"?: string;
	"custom:role"?: string;
}

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);

	constructor(
		@Inject(AppConfigService) private readonly configService: AppConfigService,
		@Inject(UsersService) private readonly usersService: UsersService,
	) {}

	/**
	 * Exchange an OAuth authorization code for Cognito tokens.
	 */
	async exchangeCodeForTokens(
		code: string,
		redirectUri: string,
	): Promise<{
		idToken: string;
		accessToken: string;
		refreshToken?: string;
		expiresIn: number;
		user: { userId: string; email: string; name: string; role: string; onboardingComplete: boolean };
	}> {
		const { COGNITO_DOMAIN, COGNITO_CLIENT_ID, COGNITO_CLIENT_SECRET } =
			this.configService.config;

		if (!COGNITO_DOMAIN || !COGNITO_CLIENT_ID) {
			throw new UnauthorizedException("Cognito is not configured");
		}

		const tokenUrl = `${COGNITO_DOMAIN}/oauth2/token`;

		const params = new URLSearchParams({
			grant_type: "authorization_code",
			client_id: COGNITO_CLIENT_ID,
			code,
			redirect_uri: redirectUri,
		});

		const headers: Record<string, string> = {
			"Content-Type": "application/x-www-form-urlencoded",
		};

		// If client secret is set, use Basic auth
		if (COGNITO_CLIENT_SECRET) {
			const basic = Buffer.from(
				`${COGNITO_CLIENT_ID}:${COGNITO_CLIENT_SECRET}`,
			).toString("base64");
			headers["Authorization"] = `Basic ${basic}`;
		}

		this.logger.debug(`Exchanging code at ${tokenUrl}`);

		const response = await fetch(tokenUrl, {
			method: "POST",
			headers,
			body: params.toString(),
		});

		if (!response.ok) {
			const errorBody = await response.text();
			this.logger.error(
				`Token exchange failed: ${response.status} ${errorBody}`,
			);
			throw new UnauthorizedException(
				`Token exchange failed: ${response.status}`,
			);
		}

		const tokens = (await response.json()) as CognitoTokenResponse;

		// Decode the ID token payload (no verification needed here — jwt.strategy handles that)
		const payload = this.decodeJwtPayload(tokens.id_token);
		const email = payload.email || payload["cognito:username"] || "";
		const name = payload.name || email;
		const sub = payload.sub;

		// Upsert user in database
		const { user, role } = await this.upsertUser(sub, email, name);

		this.logger.log(`Token exchange successful for ${email} (role=${role})`);

		return {
			idToken: tokens.id_token,
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			expiresIn: tokens.expires_in,
			user: {
				userId: user.id,
				email: user.email,
				name: user.name,
				role,
				onboardingComplete: user.onboardingComplete ?? false,
			},
		};
	}

	/**
	 * Find or create a user upon login. Auto-promotes DEFAULT_ADMINS.
	 */
	private async upsertUser(
		googleSub: string,
		email: string,
		name: string,
	): Promise<{ user: { id: string; email: string; name: string; onboardingComplete: boolean }; role: string }> {
		const isDefaultAdmin = DEFAULT_ADMINS.includes(email.toLowerCase());

		let existing = await this.usersService.getByEmail(email);

		if (existing) {
			// Update last login and auto-promote if default admin
			const updates: Record<string, unknown> = {
				lastLoginAt: new Date().toISOString(),
			};
			if (isDefaultAdmin && existing.role !== "admin") {
				updates["role"] = "admin";
			}
			existing = await this.usersService.update(existing.id, updates);
			return {
				user: { id: existing.id, email: existing.email, name: existing.name, onboardingComplete: existing.onboardingComplete ?? false },
				role: existing.role,
			};
		}

		// Create new user
		const role = isDefaultAdmin ? "admin" : "employee";
		const newUser = await this.usersService.create({
			googleId: googleSub,
			email,
			name,
			role,
		});

		return {
			user: { id: newUser.id, email: newUser.email, name: newUser.name, onboardingComplete: newUser.onboardingComplete ?? false },
			role: newUser.role,
		};
	}

	async validateUser(payload: { sub: string; email: string }) {
		return {
			userId: payload.sub,
			email: payload.email,
		};
	}

	private decodeJwtPayload(jwt: string): TokenPayload {
		const parts = jwt.split(".");
		if (parts.length !== 3) {
			throw new UnauthorizedException("Invalid JWT format");
		}
		const payload = Buffer.from(parts[1]!, "base64url").toString("utf-8");
		return JSON.parse(payload);
	}
}
