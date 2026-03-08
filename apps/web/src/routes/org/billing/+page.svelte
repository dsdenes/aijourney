<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';

  const API_BASE = import.meta.env.VITE_API_URL || '/api';

  let tenant = $state<Record<string, unknown> | null>(null);
  let quota = $state<Record<string, unknown> | null>(null);
  let loading = $state(true);
  let error = $state('');

  async function loadData() {
    try {
      const [tenantRes, quotaRes] = await Promise.all([
        fetch(`${API_BASE}/tenants/current`, {
          headers: { Authorization: `Bearer ${auth.user?.token}` },
        }),
        fetch(`${API_BASE}/quotas/status`, {
          headers: { Authorization: `Bearer ${auth.user?.token}` },
        }),
      ]);

      if (tenantRes.ok) {
        const { data: t } = await tenantRes.json();
        tenant = t;
      }
      if (quotaRes.ok) {
        const { data: q } = await quotaRes.json();
        quota = q;
      }
    } catch {
      error = 'Failed to load billing information';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (auth.user?.token) loadData();
  });

  async function openCheckout(plan: string) {
    if (plan === 'enterprise') {
      error = 'Enterprise is available by negotiation only. Contact us to discuss pricing and rollout.';
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/billing/checkout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.user?.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan,
          successUrl: `${window.location.origin}/org/billing?success=true`,
          cancelUrl: `${window.location.origin}/org/billing`,
        }),
      });

      if (res.ok) {
        const { data } = await res.json();
        if (data.url) window.location.href = data.url;
      } else {
        const body = await res.json().catch(() => ({}));
        error = body.error?.message || 'Failed to create checkout session';
      }
    } catch {
      error = 'Failed to connect to server';
    }
  }

  async function openPortal() {
    try {
      const res = await fetch(`${API_BASE}/billing/portal`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.user?.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/org/billing`,
        }),
      });

      if (res.ok) {
        const { data } = await res.json();
        if (data.url) window.location.href = data.url;
      } else {
        error = 'Failed to open billing portal';
      }
    } catch {
      error = 'Failed to connect to server';
    }
  }

  async function purchasePack(quantity: number) {
    try {
      const res = await fetch(`${API_BASE}/billing/llm-packs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.user?.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quantity,
          successUrl: `${window.location.origin}/org/billing?pack=success`,
          cancelUrl: `${window.location.origin}/org/billing`,
        }),
      });

      if (res.ok) {
        const { data } = await res.json();
        if (data.url) window.location.href = data.url;
      } else {
        error = 'Failed to create checkout';
      }
    } catch {
      error = 'Failed to connect to server';
    }
  }
</script>

<div class="space-y-6">
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <p class="text-text-muted">Loading billing information...</p>
    </div>
  {:else if error}
    <div class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">{error}</div>
  {:else}
    <!-- Current Plan -->
    <div class="rounded-lg border border-border bg-surface p-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-text">Current Plan</h2>
          <span class="mt-1 inline-flex items-center rounded-full px-3 py-1 text-sm font-medium
            {tenant?.plan === 'enterprise' ? 'bg-purple-100 text-purple-800' :
             tenant?.plan === 'pro' ? 'bg-blue-100 text-blue-800' :
             'bg-gray-100 text-gray-800'}">
            {((tenant?.plan as string) || 'free').toUpperCase()}
          </span>
        </div>
        {#if tenant?.stripeCustomerId}
          <button
            onclick={openPortal}
            class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-dark"
          >
            Manage Subscription
          </button>
        {/if}
      </div>
    </div>

    <!-- Usage -->
    {#if quota}
      <div class="rounded-lg border border-border bg-surface p-6">
        <h2 class="text-lg font-semibold text-text">Usage</h2>
        <div class="mt-4">
          <div class="flex items-center justify-between text-sm">
            <span class="text-text-muted">LLM Calls This Month</span>
            <span class="font-medium text-text">
              {quota.used}
              / {quota.totalLimit === -1 ? '∞' : quota.totalLimit}
            </span>
          </div>
          {#if (quota.totalLimit as number) > 0}
            <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-dark">
              <div
                class="h-full rounded-full transition-all
                  {((quota.used as number) / (quota.totalLimit as number)) > 0.9 ? 'bg-red-500' :
                   ((quota.used as number) / (quota.totalLimit as number)) > 0.7 ? 'bg-yellow-500' : 'bg-primary'}"
                style="width: {Math.min(100, ((quota.used as number) / (quota.totalLimit as number)) * 100)}%"
              ></div>
            </div>
          {/if}
          <p class="mt-2 text-sm text-text-muted">
            {quota.remainingCalls === Number.MAX_SAFE_INTEGER ? 'Unlimited' : `${quota.remainingCalls} calls remaining`}
          </p>
        </div>
      </div>
    {/if}

    <!-- Upgrade Plans -->
    {#if tenant?.plan !== 'enterprise'}
      <div class="rounded-lg border border-border bg-surface p-6">
        <h2 class="text-lg font-semibold text-text">Upgrade Plan</h2>
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          {#if tenant?.plan === 'free'}
            <div class="rounded-lg border-2 border-blue-200 p-4">
              <h3 class="font-semibold text-text">Pro</h3>
              <p class="mt-1 text-sm text-text-muted">25 users, 5,000 LLM calls/mo, KB Builder</p>
              <button
                onclick={() => openCheckout('pro')}
                class="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Upgrade to Pro
              </button>
            </div>
          {/if}
          <div class="rounded-lg border-2 border-purple-200 p-4">
            <h3 class="font-semibold text-text">Enterprise</h3>
            <p class="mt-1 text-sm text-text-muted">Unlimited users, 50,000 LLM calls/mo, Priority support</p>
            <div class="mt-3 rounded-lg bg-purple-50 px-4 py-3 text-sm text-purple-900">
              Enterprise is available by negotiation only.
            </div>
            <p class="mt-2 text-xs text-text-muted">Contact us to discuss pricing, onboarding, and support requirements.</p>
          </div>
        </div>
      </div>
    {/if}

    <!-- LLM Call Packs -->
    <div class="rounded-lg border border-border bg-surface p-6">
      <h2 class="text-lg font-semibold text-text">Additional LLM Call Packs</h2>
      <p class="mt-1 text-sm text-text-muted">Purchase packs of 1,000 additional LLM calls</p>
      <div class="mt-4 flex gap-3">
        <button
          onclick={() => purchasePack(1)}
          class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-dark"
        >
          1 Pack (1,000 calls)
        </button>
        <button
          onclick={() => purchasePack(5)}
          class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-dark"
        >
          5 Packs (5,000 calls)
        </button>
        <button
          onclick={() => purchasePack(10)}
          class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-dark"
        >
          10 Packs (10,000 calls)
        </button>
      </div>
    </div>
  {/if}
</div>
