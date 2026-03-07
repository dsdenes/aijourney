#!/usr/bin/env tsx
import { randomBytes } from 'crypto';
import 'dotenv/config';
import { MongoClient } from 'mongodb';

type TenantPlan = 'free' | 'pro' | 'enterprise';

interface Args {
  name: string;
  slug: string;
  email: string;
  plan: TenantPlan;
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) {
      continue;
    }
    values.set(key.slice(2), value);
    index += 1;
  }

  const name = values.get('name');
  const slug = values.get('slug');
  const email = values.get('email')?.toLowerCase();
  const plan = (values.get('plan') ?? 'free') as TenantPlan;

  if (!name || !slug || !email) {
    throw new Error(
      'Usage: pnpm tsx scripts/create-tenant-with-owner.ts --name <name> --slug <slug> --email <owner-email> [--plan free|pro|enterprise]',
    );
  }

  if (!['free', 'pro', 'enterprise'].includes(plan)) {
    throw new Error(`Invalid plan: ${plan}`);
  }

  return { name, slug, email, plan };
}

function generateId(): string {
  return (
    Date.now().toString(36) +
    Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
  );
}

async function main() {
  const { name, slug, email, plan } = parseArgs(process.argv.slice(2));
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB || 'aijourney';
  const now = new Date().toISOString();

  const client = new MongoClient(mongoUri);
  await client.connect();

  try {
    const db = client.db(dbName);
    const users = db.collection('users');
    const tenants = db.collection('tenants');
    const memberships = db.collection('user_tenant_memberships');
    const invitations = db.collection('invitations');

    let tenant = await tenants.findOne({ slug });
    let tenantCreated = false;
    if (!tenant) {
      const tenantId = generateId();
      const quotasByPlan: Record<TenantPlan, { maxUsers: number; maxLlmCallsPerMonth: number }> = {
        free: { maxUsers: 3, maxLlmCallsPerMonth: 100 },
        pro: { maxUsers: 25, maxLlmCallsPerMonth: 5000 },
        enterprise: { maxUsers: -1, maxLlmCallsPerMonth: 50000 },
      };

      tenant = {
        _id: tenantId,
        id: tenantId,
        name,
        slug,
        plan,
        settings: {},
        quotas: {
          ...quotasByPlan[plan],
          additionalLlmCalls: 0,
        },
        usage: {
          currentPeriodStart: now,
          llmCallsUsed: 0,
          lastResetAt: now,
        },
        createdAt: now,
        updatedAt: now,
      };
      await tenants.insertOne(tenant);
      tenantCreated = true;
    }

    const tenantId = (tenant.id || tenant._id) as string;
    const existingUser = await users.findOne({ email });

    if (existingUser) {
      const existingMembership = await memberships.findOne({ userId: existingUser._id, tenantId });
      if (!existingMembership) {
        const membershipId = generateId();
        await memberships.insertOne({
          _id: membershipId,
          id: membershipId,
          userId: existingUser._id,
          tenantId,
          orgRole: 'owner',
          createdAt: now,
          updatedAt: now,
        });
      } else if (existingMembership.orgRole !== 'owner') {
        await memberships.updateOne(
          { _id: existingMembership._id },
          { $set: { orgRole: 'owner', updatedAt: now } },
        );
      }

      await users.updateOne(
        { _id: existingUser._id },
        {
          $set: {
            tenantId,
            orgRole: 'owner',
            updatedAt: now,
          },
        },
      );

      console.log(
        JSON.stringify(
          {
            ok: true,
            tenantId,
            tenantName: name,
            slug,
            plan,
            ownerEmail: email,
            ownerAction: 'assigned',
            tenantCreated,
          },
          null,
          2,
        ),
      );
      return;
    }

    const existingInvitation = await invitations.findOne({
      email,
      tenantId,
      status: 'pending',
    });

    if (!existingInvitation) {
      const invitationId = generateId();
      await invitations.insertOne({
        _id: invitationId,
        id: invitationId,
        tenantId,
        email,
        orgRole: 'owner',
        invitedBy: 'script',
        status: 'pending',
        token: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: now,
      });
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          tenantId,
          tenantName: name,
          slug,
          plan,
          ownerEmail: email,
          ownerAction: 'invited',
          tenantCreated,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
