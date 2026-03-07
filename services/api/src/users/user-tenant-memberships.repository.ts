import type { OrgRole, UserTenantMembership } from '@aijourney/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { Db } from 'mongodb';
import { MONGODB_DB } from '../mongodb/mongodb.module';

interface UserTenantMembershipDoc {
  _id: string;
  [key: string]: unknown;
}

function toDoc(membership: UserTenantMembership): UserTenantMembershipDoc {
  const { id, ...rest } = membership;
  return { _id: id, ...rest } as UserTenantMembershipDoc;
}

function fromDoc(doc: UserTenantMembershipDoc): UserTenantMembership {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as UserTenantMembership;
}

@Injectable()
export class UserTenantMembershipsRepository {
  private readonly col;

  constructor(@Inject(MONGODB_DB) db: Db) {
    this.col = db.collection<UserTenantMembershipDoc>('user_tenant_memberships');
  }

  async create(membership: UserTenantMembership): Promise<UserTenantMembership> {
    await this.col.insertOne(toDoc(membership));
    return membership;
  }

  async getByUserAndTenant(
    userId: string,
    tenantId: string,
  ): Promise<UserTenantMembership | undefined> {
    const doc = await this.col.findOne({ userId, tenantId });
    return doc ? fromDoc(doc as UserTenantMembershipDoc) : undefined;
  }

  async listByUser(userId: string): Promise<UserTenantMembership[]> {
    const docs = await this.col.find({ userId }).sort({ createdAt: 1 }).toArray();
    return docs.map((doc) => fromDoc(doc));
  }

  async listByTenant(tenantId: string): Promise<UserTenantMembership[]> {
    const docs = await this.col.find({ tenantId }).sort({ createdAt: 1 }).toArray();
    return docs.map((doc) => fromDoc(doc));
  }

  async countByTenant(tenantId: string): Promise<number> {
    return this.col.countDocuments({ tenantId });
  }

  async updateRole(userId: string, tenantId: string, orgRole: OrgRole): Promise<void> {
    await this.col.updateOne(
      { userId, tenantId },
      { $set: { orgRole, updatedAt: new Date().toISOString() } },
    );
  }
}
