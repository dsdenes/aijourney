#!/usr/bin/env tsx
/**
 * Creates a "Demo" tenant and assigns all existing users to it.
 * Safe to run multiple times — skips if "demo" tenant already exists.
 *
 * Usage: pnpm tsx scripts/create-demo-tenant.ts
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DEMO_TENANT_SLUG = "demo";
const DEMO_TENANT_NAME = "Demo";

// Only this email gets superadmin; all others become regular users
const SUPERADMIN_EMAIL = "dsdenes@gmail.com";

async function main() {
	console.log(`Connecting to MongoDB: ${uri}`);
	const client = new MongoClient(uri);
	await client.connect();
	const db = client.db("aijourney");

	// 1. Check if demo tenant already exists
	const tenantsCol = db.collection("tenants");
	let demoTenant = await tenantsCol.findOne({ slug: DEMO_TENANT_SLUG });

	if (demoTenant) {
		console.log(`✓ Demo tenant already exists (id: ${demoTenant.id})`);
	} else {
		// Create demo tenant
		const now = new Date().toISOString();
		const tenantId = generateId();
		demoTenant = {
			id: tenantId,
			name: DEMO_TENANT_NAME,
			slug: DEMO_TENANT_SLUG,
			plan: "free",
			settings: {},
			quotas: {
				maxUsers: 3,
				maxLlmCallsPerMonth: 100,
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
		await tenantsCol.insertOne(demoTenant);
		console.log(`✓ Created Demo tenant (id: ${tenantId})`);
	}

	const demoTenantId = demoTenant.id as string;

	// 2. Assign all existing users to the demo tenant
	const usersCol = db.collection("users");
	const allUsers = await usersCol.find({}).toArray();

	let updated = 0;
	let skipped = 0;

	for (const user of allUsers) {
		const email = ((user.email as string) || "").toLowerCase();
		const isSuperadmin = email === SUPERADMIN_EMAIL.toLowerCase();

		const updates: Record<string, unknown> = {};

		// Assign to demo tenant if not already assigned
		if (!user.tenantId || user.tenantId !== demoTenantId) {
			updates.tenantId = demoTenantId;
		}

		// Set orgRole — first superadmin user is owner, rest are members
		if (!user.orgRole) {
			updates.orgRole = isSuperadmin ? "owner" : "member";
		}

		// Set globalRole
		if (isSuperadmin && user.globalRole !== "superadmin") {
			updates.globalRole = "superadmin";
		} else if (!isSuperadmin && user.globalRole === "superadmin") {
			updates.globalRole = "user";
		}

		if (Object.keys(updates).length > 0) {
			await usersCol.updateOne({ _id: user._id }, { $set: updates });
			console.log(`  → Updated ${user.email}: ${JSON.stringify(updates)}`);
			updated++;
		} else {
			skipped++;
		}
	}

	// 3. Clean up orphaned tenants (tenants with no users, except demo)
	const allTenants = await tenantsCol.find({}).toArray();
	let deletedTenants = 0;
	for (const tenant of allTenants) {
		if (tenant.id === demoTenantId) continue;
		const userCount = await usersCol.countDocuments({ tenantId: tenant.id });
		if (userCount === 0) {
			await tenantsCol.deleteOne({ _id: tenant._id });
			console.log(`  🗑 Deleted empty tenant: ${tenant.name} (${tenant.slug})`);
			deletedTenants++;
		}
	}

	console.log(`\nDone!`);
	console.log(`  ${allUsers.length} total users`);
	console.log(`  ${updated} updated, ${skipped} already correct`);
	console.log(`  ${deletedTenants} empty tenants cleaned up`);
	console.log(`  Demo tenant ID: ${demoTenantId}`);
	console.log(`  Superadmin: ${SUPERADMIN_EMAIL}`);

	await client.close();
}

/** Simple ULID-like ID generator (matches shared generateId) */
function generateId(): string {
	const timestamp = Date.now().toString(36);
	const random = Array.from({ length: 16 }, () =>
		Math.floor(Math.random() * 36).toString(36),
	).join("");
	return `${timestamp}${random}`;
}

main().catch(console.error);
