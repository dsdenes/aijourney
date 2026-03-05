import type { GlobalRole, OrgRole } from "@aijourney/shared";
import { generateId, nowISO } from "@aijourney/shared";
import {
	Inject,
	Injectable,
	Logger,
	UnauthorizedException,
} from "@nestjs/common";
import { AppConfigService } from "../config/config.service";
import { InvitationsService } from "../invitations/invitations.service";
import { TenantsService } from "../tenants/tenants.service";
import { UsersService } from "../users/users.service";

/** Emails that are automatically promoted to superadmin on first login */
const DEFAULT_SUPERADMINS = [
	"dsdenes@gmail.com",
];

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

interface AuthUserResponse {
	userId: string;
	email: string;
	name: string;
	role: string;
	globalRole: GlobalRole;
	tenantId: string;
	tenantName: string;
	orgRole: OrgRole;
	onboardingComplete: boolean;
}

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);

	constructor(
		@Inject(AppConfigService) private readonly configService: AppConfigService,
		@Inject(UsersService) private readonly usersService: UsersService,
		@Inject(TenantsService) private readonly tenantsService: TenantsService,
		@Inject(InvitationsService) private readonly invitationsService: InvitationsService,
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
		user: AuthUserResponse;
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
		const user = await this.upsertUser(sub, email, name);

		this.logger.log(
			`Token exchange successful for ${email} (globalRole=${user.globalRole}, orgRole=${user.orgRole})`,
		);

		return {
			idToken: tokens.id_token,
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			expiresIn: tokens.expires_in,
			user,
		};
	}

	/**
	 * Find or create a user upon login.
	 * - If user already exists: update lastLoginAt, auto-promote superadmins.
	 * - If user is new with a pending invitation: accept invitation and create user in that tenant.
	 * - If user is new with no invitation: create a new personal tenant AND user (self-onboarding).
	 * - Superadmin list is still honoured for global role promotion.
	 */
	private async upsertUser(
		googleSub: string,
		email: string,
		name: string,
	): Promise<AuthUserResponse> {
		const isSuperadmin = DEFAULT_SUPERADMINS.includes(email.toLowerCase());

		// 1. Check if user already exists
		let existing = await this.usersService.getByEmail(email);

		if (existing) {
			const updates: Record<string, unknown> = {
				lastLoginAt: new Date().toISOString(),
			};

			// Auto-promote superadmins
			if (isSuperadmin && existing.globalRole !== "superadmin") {
				updates["globalRole"] = "superadmin";
			}

			// Demote non-superadmins who were previously superadmin
			if (!isSuperadmin && existing.globalRole === "superadmin") {
				updates["globalRole"] = "user";
			}

			// Backfill googleId if missing
			if (!existing.googleId) {
				updates["googleId"] = googleSub;
			}

			existing = await this.usersService.update(existing.id, updates);

			// Resolve tenant name
			let tenantName = "";
			if (existing.tenantId) {
				try {
					const tenant = await this.tenantsService.getById(existing.tenantId);
					tenantName = tenant.name;
				} catch {
					// Tenant may have been deleted
				}
			}

			return {
				userId: existing.id,
				email: existing.email,
				name: existing.name,
				role: existing.role,
				globalRole: existing.globalRole ?? "user",
				tenantId: existing.tenantId ?? "",
				tenantName,
				orgRole: existing.orgRole ?? "member",
				onboardingComplete: existing.onboardingComplete ?? false,
			};
		}

		// 2. Check for pending invitation
		const pendingInvitations =
			await this.invitationsService.findPendingForEmail(email);

		if (pendingInvitations.length > 0) {
			// Accept the oldest pending invitation
			const invitation = pendingInvitations[0]!;

			// Create user with invited tenant and role
			const newUser = await this.usersService.create({
				googleId: googleSub,
				email,
				name,
				role: invitation.orgRole === "owner" ? "admin" : "employee",
				globalRole: isSuperadmin ? "superadmin" : "user",
				tenantId: invitation.tenantId,
				orgRole: invitation.orgRole,
			});

			// Mark invitation as accepted
			await this.invitationsService.accept(invitation.id);

			// Resolve tenant name
			let tenantName = "";
			try {
				const tenant = await this.tenantsService.getById(invitation.tenantId);
				tenantName = tenant.name;
			} catch {
				// Tenant may have been deleted
			}

			this.logger.log(
				`New user ${email} joined tenant ${invitation.tenantId} via invitation`,
			);

			return {
				userId: newUser.id,
				email: newUser.email,
				name: newUser.name,
				role: newUser.role,
				globalRole: newUser.globalRole ?? "user",
				tenantId: newUser.tenantId ?? "",
				tenantName,
				orgRole: newUser.orgRole ?? "member",
				onboardingComplete: newUser.onboardingComplete ?? false,
			};
		}

		// 3. Self-onboarding: create a new tenant for this user
		const slug =
			email
				.split("@")[0]
				?.replace(/[^a-z0-9-]/gi, "-")
				.toLowerCase() || generateId();
		const tenant = await this.tenantsService.create({
			name: `${name}'s Organization`,
			slug,
			plan: "free" as const,
		});

		const newUser = await this.usersService.create({
			googleId: googleSub,
			email,
			name,
			role: "admin",
			globalRole: isSuperadmin ? "superadmin" : "user",
			tenantId: tenant.id,
			orgRole: "owner" as OrgRole,
		});

		this.logger.log(
			`New user ${email} self-onboarded with personal tenant ${tenant.id}`,
		);

		return {
			userId: newUser.id,
			email: newUser.email,
			name: newUser.name,
			role: newUser.role,
			globalRole: newUser.globalRole ?? "user",
			tenantId: newUser.tenantId ?? "",
			tenantName: tenant.name,
			orgRole: newUser.orgRole ?? "owner",
			onboardingComplete: newUser.onboardingComplete ?? false,
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
