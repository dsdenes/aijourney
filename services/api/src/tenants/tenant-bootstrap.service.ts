import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Db } from 'mongodb';
import { MONGODB_DB } from '../mongodb/mongodb.module';
import { UsersService } from '../users/users.service';
import { TenantsService } from './tenants.service';

const DEMO_TENANT_NAME = 'DEMO';
const DEMO_TENANT_SLUG = 'demo';
const TENANT_MIGRATION_ID = 'tenant-membership-migration-v1';
const DEFAULT_SUPERADMIN_EMAILS = ['dsdenes@gmail.com'];

@Injectable()
export class TenantBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(TenantBootstrapService.name);

  constructor(
    @Inject(MONGODB_DB) private readonly db: Db,
    @Inject(TenantsService) private readonly tenantsService: TenantsService,
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {}

  async onModuleInit(): Promise<void> {
    const settings = this.db.collection<{ _id: string; migratedAt: string; tenantId: string }>(
      'system_settings',
    );
    const migrationState = await settings.findOne({ _id: TENANT_MIGRATION_ID });

    if (migrationState) {
      return;
    }

    const demoTenant = await this.tenantsService.ensureTenant({
      name: DEMO_TENANT_NAME,
      slug: DEMO_TENANT_SLUG,
      plan: 'free',
    });

    const migratedUsers = await this.usersService.assignAllUsersToTenant(
      demoTenant.id,
      DEFAULT_SUPERADMIN_EMAILS,
    );

    await settings.insertOne({
      _id: TENANT_MIGRATION_ID,
      migratedAt: new Date().toISOString(),
      tenantId: demoTenant.id,
    });

    this.logger.log(
      `Ensured demo tenant ${demoTenant.id} and normalized ${migratedUsers} existing users`,
    );
  }
}