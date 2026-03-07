import type { User } from '@aijourney/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { Db } from 'mongodb';
import { MONGODB_DB } from '../mongodb/mongodb.module';

interface UserDoc {
  _id: string;
  [key: string]: unknown;
}

function toDoc(user: User): UserDoc {
  const { id, ...rest } = user;
  return { _id: id, ...rest } as UserDoc;
}

function fromDoc(doc: UserDoc): User {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as User;
}

@Injectable()
export class UsersRepository {
  private readonly col;

  constructor(@Inject(MONGODB_DB) db: Db) {
    this.col = db.collection<UserDoc>('users');
  }

  async create(user: User): Promise<User> {
    await this.col.insertOne(toDoc(user));
    return user;
  }

  async getById(id: string): Promise<User | undefined> {
    const doc = await this.col.findOne({ _id: id });
    return doc ? fromDoc(doc) : undefined;
  }

  async getByEmail(email: string): Promise<User | undefined> {
    const doc = await this.col.findOne({ email });
    return doc ? fromDoc(doc as UserDoc) : undefined;
  }

  async getByGoogleId(googleId: string): Promise<User | undefined> {
    const doc = await this.col.findOne({ googleId });
    return doc ? fromDoc(doc as UserDoc) : undefined;
  }

  async update(id: string, updates: Partial<User>): Promise<void> {
    const { id: _id, ...rest } = updates;
    if (Object.keys(rest).length === 0) return;
    await this.col.updateOne({ _id: id }, { $set: rest });
  }

  /** List all users (superadmin — cross-tenant). */
  async listAll(limit = 50): Promise<User[]> {
    const docs = await this.col.find({}).limit(limit).toArray();
    return docs.map((d) => fromDoc(d));
  }

  /** List users within a specific tenant. */
  async listByTenant(tenantId: string, limit = 200): Promise<User[]> {
    const docs = await this.col.find({ tenantId }).sort({ createdAt: -1 }).limit(limit).toArray();
    return docs.map((d) => fromDoc(d));
  }

  /** Count users in a tenant. */
  async countByTenant(tenantId: string): Promise<number> {
    return this.col.countDocuments({ tenantId });
  }

  /** Count all users (superadmin). */
  async countAll(): Promise<number> {
    return this.col.countDocuments({});
  }
}
