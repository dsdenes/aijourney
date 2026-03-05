#!/usr/bin/env tsx
/**
 * Migration script: Convert single-tenant data to multi-tenant format.
 *
 * This script:
 * 1. Creates a default tenant for the existing organization
 * 2. Assigns all existing users to that tenant with appropriate roles
 * 3. Adds tenantId to all existing data (journeys, runs, agent_runs, memory_facts)
 * 4. Creates multi-tenant indexes
 *
 * Usage: pnpm tsx scripts/migrate-to-multi-tenant.ts
 *
 * Safe to run multiple times (idempotent).
 */
import { MongoClient } from 'mongodb';
import { ulid } from 'ulid';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';

/** Emails that should be promoted to superadmin */
const SUPERADMIN_EMAILS = ['d.pal@mito.hu', 'paldaniel@gmail.com', 'dsdenes@gmail.com'];

const DEFAULT_TENANT_SLUG = 'mito';
const DEFAULT_TENANT_NAME = 'Mito';

async function main() {
  console.log(`Connecting to MongoDB: ${uri}`);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('aijourney');

  const now = new Date().toISOString();
  const tenantsColl = db.collection('tenants');
  const usersColl = db.collection('users');

  // 1. Create default tenant (if it doesn't exist)
  console.log('\n1. Creating default tenant...');
  let defaultTenant = await tenantsColl.findOne({ slug: DEFAULT_TENANT_SLUG });

  if (!defaultTenant) {
    const tenantId = ulid();
    await tenantsColl.insertOne({
      id: tenantId,
      name: DEFAULT_TENANT_NAME,
      slug: DEFAULT_TENANT_SLUG,
      plan: 'enterprise',
      settings: {},
      quotas: {
        maxUsers: -1,
        maxLlmCallsPerMonth: 50_000,
        additionalLlmCalls: 0,
      },
      usage: {
        currentPeriodStart: now,
        llmCallsUsed: 0,
        lastResetAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });
    defaultTenant = await tenantsColl.findOne({ slug: DEFAULT_TENANT_SLUG });
    console.log(`  ✓ Created default tenant: ${tenantId}`);
  } else {
    console.log(`  ✓ Default tenant already exists: ${defaultTenant.id}`);
  }

  const tenantId = defaultTenant!.id as string;

  // 2. Assign users to tenant + set roles
  console.log('\n2. Migrating users...');
  const users = await usersColl.find({}).toArray();

  for (const user of users) {
    const updates: Record<string, unknown> = {};

    // Set tenantId if missing
    if (!user.tenantId) {
      updates.tenantId = tenantId;
    }

    // Set globalRole
    if (!user.globalRole) {
      const isSuperadmin = SUPERADMIN_EMAILS.includes((user.email as string).toLowerCase());
      updates.globalRole = isSuperadmin ? 'superadmin' : 'user';
    }

    // Set orgRole
    if (!user.orgRole) {
      // First user / admins get "owner", rest get "member"
      updates.orgRole = user.role === 'admin' ? 'owner' : 'member';
    }

    if (Object.keys(updates).length > 0) {
      await usersColl.updateOne({ _id: user._id }, { $set: updates });
      console.log(`  ✓ Updated user ${user.email}: ${JSON.stringify(updates)}`);
    } else {
      console.log(`  - User ${user.email} already migrated`);
    }
  }

  // 3. Add tenantId to existing collections
  const collectionsToMigrate = [
    'journeys',
    'run_requests',
    'run_logs',
    'agent_runs',
    'memory_facts',
    'memory_extractions',
    'events',
  ];

  console.log('\n3. Adding tenantId to existing data...');
  for (const collName of collectionsToMigrate) {
    const coll = db.collection(collName);
    const result = await coll.updateMany({ tenantId: { $exists: false } }, { $set: { tenantId } });
    console.log(`  ✓ ${collName}: ${result.modifiedCount} documents updated`);
  }

  // For journeys, also propagate tenantId based on userId
  console.log('\n4. Propagating tenantId to journeys via userId...');
  const journeys = await db
    .collection('journeys')
    .find({ userId: { $exists: true } })
    .toArray();
  for (const journey of journeys) {
    const owner = await usersColl.findOne({ id: journey.userId });
    if (owner && owner.tenantId) {
      await db
        .collection('journeys')
        .updateOne({ _id: journey._id }, { $set: { tenantId: owner.tenantId as string } });
    }
  }
  console.log(`  ✓ Processed ${journeys.length} journeys`);

  // 5. Create multi-tenant indexes
  console.log('\n5. Creating multi-tenant indexes...');

  await tenantsColl.createIndex({ slug: 1 }, { unique: true, name: 'slug_unique' });

  await db
    .collection('invitations')
    .createIndex({ token: 1 }, { unique: true, name: 'token_unique' });
  await db
    .collection('invitations')
    .createIndex({ tenantId: 1, status: 1 }, { name: 'tenantId_status' });
  await db
    .collection('invitations')
    .createIndex({ email: 1, tenantId: 1 }, { name: 'email_tenantId' });
  await db
    .collection('invitations')
    .createIndex({ expiresAt: 1 }, { name: 'expiresAt_ttl', expireAfterSeconds: 0 });

  await usersColl.createIndex({ tenantId: 1, email: 1 }, { name: 'tenantId_email' });
  await usersColl.createIndex(
    { googleId: 1 },
    { unique: true, sparse: true, name: 'googleId_unique' },
  );

  await db
    .collection('journeys')
    .createIndex({ tenantId: 1, createdAt: -1 }, { name: 'tenantId_createdAt_desc' });

  await db
    .collection('run_requests')
    .createIndex({ tenantId: 1, status: 1 }, { name: 'tenantId_status' });

  await db
    .collection('agent_runs')
    .createIndex({ tenantId: 1, createdAt: -1 }, { name: 'tenantId_createdAt_desc' });

  await db
    .collection('memory_facts')
    .createIndex({ tenantId: 1, category: 1 }, { name: 'tenantId_category' });

  console.log('  ✓ All indexes created');

  // Summary
  const tenantCount = await tenantsColl.countDocuments();
  const userCount = await usersColl.countDocuments();
  const migratedUsers = await usersColl.countDocuments({
    tenantId: { $exists: true },
  });

  console.log('\n=== Migration Summary ===');
  console.log(`Tenants: ${tenantCount}`);
  console.log(`Users: ${userCount} (${migratedUsers} with tenantId)`);
  console.log('========================\n');

  await client.close();
  console.log('Done!');
}

main().catch(console.error);
