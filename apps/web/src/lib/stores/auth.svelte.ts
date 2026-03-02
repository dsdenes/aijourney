const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN as
	| string
	| undefined;
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID as
	| string
	| undefined;
const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface AuthUser {
	userId: string;
	email: string;
	name: string;
	role: string;
	token: string;
	onboardingComplete: boolean;
}

function createAuth() {
	let user = $state<AuthUser | null>(null);
	let loading = $state(true);

	// Try to restore from localStorage
	if (typeof window !== "undefined") {
		const stored = localStorage.getItem("auth_user");
		if (stored) {
			try {
				user = JSON.parse(stored);
			} catch {
				localStorage.removeItem("auth_user");
			}
		}
		loading = false;
	}

	return {
		get user() {
			return user;
		},
		get loading() {
			return loading;
		},

		login() {
			if (COGNITO_DOMAIN && COGNITO_CLIENT_ID) {
				const redirectUri = encodeURIComponent(
					window.location.origin + "/auth/callback",
				);
				window.location.href = `${COGNITO_DOMAIN}/login?client_id=${COGNITO_CLIENT_ID}&response_type=code&scope=openid+email+profile&redirect_uri=${redirectUri}`;
			} else {
				console.error(
					"Cognito is not configured. Set VITE_COGNITO_DOMAIN and VITE_COGNITO_CLIENT_ID in .env",
				);
			}
		},

		/**
		 * Handle the OAuth callback — exchange the authorization code for tokens
		 * and set the authenticated user.
		 */
		async handleCallback(code: string) {
			const redirectUri = window.location.origin + "/auth/callback";
			const res = await fetch(`${API_BASE}/auth/token`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code, redirectUri }),
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(
					body.error?.message || `Token exchange failed: ${res.status}`,
				);
			}

			const { data } = await res.json();

			if (!data) {
				throw new Error("Token exchange failed — no data returned");
			}

			const authUser: AuthUser = {
				...data.user,
				token: data.idToken,
			};

			user = authUser;
			localStorage.setItem("auth_user", JSON.stringify(authUser));
		},

		logout() {
			user = null;
			localStorage.removeItem("auth_user");

			// If Cognito is configured, redirect to Cognito logout
			if (COGNITO_DOMAIN && COGNITO_CLIENT_ID) {
				const logoutUri = encodeURIComponent(window.location.origin);
				window.location.href = `${COGNITO_DOMAIN}/logout?client_id=${COGNITO_CLIENT_ID}&logout_uri=${logoutUri}`;
			}
		},

		setUser(newUser: AuthUser) {
			user = newUser;
			localStorage.setItem("auth_user", JSON.stringify(newUser));
		},
	};
}

export const auth = createAuth();
