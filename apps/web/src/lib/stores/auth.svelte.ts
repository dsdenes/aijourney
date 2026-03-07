const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const API_BASE = import.meta.env.VITE_API_URL || '/api';
const AUTH_USER_STORAGE_KEY = 'auth_user';
const ACTIVE_TENANT_ID_STORAGE_KEY = 'auth_active_tenant_id';
const ACTIVE_TENANT_NAME_STORAGE_KEY = 'auth_active_tenant_name';

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: string;
  globalRole: string;
  tenantId: string;
  tenantName: string;
  orgRole: string;
  token: string;
  onboardingComplete: boolean;
}

function createAuth() {
  let user = $state<AuthUser | null>(null);
  let loading = $state(true);
  let activeTenantId = $state('');
  let activeTenantName = $state('');

  function persistUser(nextUser: AuthUser | null) {
    if (typeof window === 'undefined') {
      return;
    }

    if (nextUser) {
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(nextUser));
      return;
    }

    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  }

  function persistActiveTenant(nextTenantId: string, nextTenantName: string) {
    if (typeof window === 'undefined') {
      return;
    }

    if (nextTenantId) {
      localStorage.setItem(ACTIVE_TENANT_ID_STORAGE_KEY, nextTenantId);
      localStorage.setItem(ACTIVE_TENANT_NAME_STORAGE_KEY, nextTenantName);
      return;
    }

    localStorage.removeItem(ACTIVE_TENANT_ID_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_TENANT_NAME_STORAGE_KEY);
  }

  function syncActiveTenant(nextUser: AuthUser | null) {
    if (!nextUser) {
      activeTenantId = '';
      activeTenantName = '';
      persistActiveTenant('', '');
      return;
    }

    const nextTenantId =
      nextUser.globalRole === 'superadmin' && activeTenantId ? activeTenantId : nextUser.tenantId;
    const nextTenantName =
      nextUser.globalRole === 'superadmin' && activeTenantName ? activeTenantName : nextUser.tenantName;

    activeTenantId = nextTenantId;
    activeTenantName = nextTenantName;
    persistActiveTenant(nextTenantId, nextTenantName);
  }

  // Try to restore from localStorage
  if (typeof window !== 'undefined') {
    activeTenantId = localStorage.getItem(ACTIVE_TENANT_ID_STORAGE_KEY) ?? '';
    activeTenantName = localStorage.getItem(ACTIVE_TENANT_NAME_STORAGE_KEY) ?? '';

    const stored = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (stored) {
      try {
        user = JSON.parse(stored);
        syncActiveTenant(user);
      } catch {
        localStorage.removeItem(AUTH_USER_STORAGE_KEY);
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
    get activeTenantId() {
      return activeTenantId;
    },
    get activeTenantName() {
      return activeTenantName;
    },

    login() {
      if (GOOGLE_CLIENT_ID) {
        const redirectUri = encodeURIComponent(window.location.origin + '/auth/callback');
        window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&response_type=code&scope=openid+email+profile&redirect_uri=${redirectUri}&access_type=offline&prompt=consent`;
      } else {
        console.error(
          'Google OAuth is not configured. Set GOOGLE_CLIENT_ID or VITE_GOOGLE_CLIENT_ID in the build environment.',
        );
      }
    },

    /**
     * Handle the OAuth callback — exchange the authorization code for tokens
     * and set the authenticated user.
     */
    async handleCallback(code: string) {
      const redirectUri = window.location.origin + '/auth/callback';
      const res = await fetch(`${API_BASE}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirectUri }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message || `Token exchange failed: ${res.status}`);
      }

      const { data } = await res.json();

      if (!data) {
        throw new Error('Token exchange failed — no data returned');
      }

      const authUser: AuthUser = {
        ...data.user,
        token: data.idToken,
      };

      user = authUser;
      persistUser(authUser);
      syncActiveTenant(authUser);
    },

    logout() {
      user = null;
      persistUser(null);
      syncActiveTenant(null);
      // Google OAuth doesn't have a logout endpoint — just clear local state
    },

    setUser(newUser: AuthUser) {
      user = newUser;
      persistUser(newUser);
      syncActiveTenant(newUser);
    },

    setActiveTenant(tenantId: string, tenantName: string) {
      if (!user) {
        return;
      }

      activeTenantId = tenantId || user.tenantId;
      activeTenantName = tenantName || user.tenantName;
      persistActiveTenant(activeTenantId, activeTenantName);
    },
  };
}

export const auth = createAuth();
