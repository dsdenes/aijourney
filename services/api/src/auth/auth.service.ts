import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { AppConfigService } from "../config/config.service";
import { UsersService } from "../users/users.service";

/** Emails that are automatically promoted to admin on first login */
const DEFAULT_ADMINS = ["d.pal@mito.hu", "paldaniel@gmail.com"];

interface GoogleTokenResponse {
	id_token: string;
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	token_type: string;
}

interface GoogleIdTokenPayload {
	sub: string;
	email: string;
	email_verified?: boolean;
	name?: string;
	picture?: string;
	hd?: string; // hosted domain (Google Workspace)
}

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);

	constructor(
		@Inject(AppConfigService) private readonly configService: AppConfigService,
		@Inject(UsersService) private readonly usersService: UsersService,
	) {}

	/**
	 * Exchange a Google OAuth authorization code for tokens.
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
		const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } =
			this.configService.config;

		if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
			throw new UnauthorizedException("Google OAuth is not configured");
		}

		const tokenUrl = "https://oauth2.googleapis.com/token";

		const params = new URLSearchParams({
			grant_type: "authorization_code",
			client_id: GOOGLE_CLIENT_ID,
			client_secret: GOOGLE_CLIENT_SECRET,
			code,
			redirect_uri: redirectUri,
		});

		this.logger.debug("Exchanging Google auth code for tokens");

		const response = await fetch(tokenUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: params.toString(),
		});

		if (!response.ok) {
			const errorBody = await response.text();
			this.logger.error(
				`Google token exchange failed: ${response.status} ${errorBody}`,
			);
			throw new UnauthorizedException(
				`Token exchange failed: ${response.status}`,
			);
		}

		const tokens = (await response.json()) as GoogleTokenResponse;

		// Decode the ID token payload
		const payload = this.decodeJwtPayload(tokens.id_token);
		const email = payload.email || "";
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

	private decodeJwtPayload(jwt: string): GoogleIdTokenPayload {
		const parts = jwt.split(".");
		if (parts.length !== 3) {
			throw new UnauthorizedException("Invalid JWT format");
		}
		const payload = Buffer.from(parts[1]!, "base64url").toString("utf-8");
		return JSON.parse(payload);
	}
}
