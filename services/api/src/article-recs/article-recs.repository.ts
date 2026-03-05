import type { ArticleRecommendation, ArticleRecStatus, RecBatch } from '@aijourney/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { Db } from 'mongodb';
import { MONGODB_DB } from '../mongodb/mongodb.module';

interface RecDoc {
  _id: string;
  [key: string]: unknown;
}

function toDoc(rec: ArticleRecommendation): RecDoc {
  const { id, ...rest } = rec;
  return { _id: id, ...rest } as RecDoc;
}

function fromDoc(doc: RecDoc): ArticleRecommendation {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as ArticleRecommendation;
}

interface BatchDoc {
  _id: string;
  [key: string]: unknown;
}

function toBatchDoc(batch: RecBatch): BatchDoc {
  const { id, ...rest } = batch;
  return { _id: id, ...rest } as BatchDoc;
}

function fromBatchDoc(doc: BatchDoc): RecBatch {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as RecBatch;
}

@Injectable()
export class ArticleRecsRepository {
  private readonly recs;
  private readonly batches;

  constructor(@Inject(MONGODB_DB) db: Db) {
    this.recs = db.collection<RecDoc>('article_recommendations');
    this.batches = db.collection<BatchDoc>('article_rec_batches');
  }

  // ── Recommendations ──

  async createRec(rec: ArticleRecommendation): Promise<ArticleRecommendation> {
    await this.recs.insertOne(toDoc(rec));
    return rec;
  }

  async createManyRecs(recs: ArticleRecommendation[]): Promise<void> {
    if (recs.length === 0) return;
    await this.recs.insertMany(recs.map(toDoc));
  }

  async getRecById(id: string): Promise<ArticleRecommendation | undefined> {
    const doc = await this.recs.findOne({ _id: id });
    return doc ? fromDoc(doc) : undefined;
  }

  async getRecsForUser(userId: string, limit = 20): Promise<ArticleRecommendation[]> {
    const docs = await this.recs.find({ userId }).sort({ createdAt: -1 }).limit(limit).toArray();
    return docs.map(fromDoc);
  }

  async getPendingRecsForUser(userId: string): Promise<ArticleRecommendation[]> {
    const docs = await this.recs
      .find({ userId, status: 'pending' })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(fromDoc);
  }

  async updateRecStatus(id: string, status: ArticleRecStatus): Promise<void> {
    const updates: Record<string, unknown> = { status };
    if (status === 'read') updates['readAt'] = new Date().toISOString();
    if (status === 'dismissed') updates['dismissedAt'] = new Date().toISOString();
    await this.recs.updateOne({ _id: id }, { $set: updates });
  }

  async countByStatus(tenantId?: string): Promise<Record<ArticleRecStatus, number>> {
    const match = tenantId ? { tenantId } : {};
    const pipeline = [{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }];
    const results = await this.recs.aggregate(pipeline).toArray();
    const counts: Record<string, number> = {
      pending: 0,
      read: 0,
      dismissed: 0,
    };
    for (const r of results) {
      counts[r._id as string] = r.count as number;
    }
    return counts as Record<ArticleRecStatus, number>;
  }

  async countTotal(tenantId?: string): Promise<number> {
    const filter = tenantId ? { tenantId } : {};
    return this.recs.countDocuments(filter);
  }

  async getRecsByBatch(batchId: string): Promise<ArticleRecommendation[]> {
    const docs = await this.recs.find({ batchId }).sort({ createdAt: -1 }).toArray();
    return docs.map(fromDoc);
  }

  async getJobTitleStats(
    tenantId?: string,
  ): Promise<{ jobTitle: string; userCount: number; recCount: number }[]> {
    const match = tenantId ? { tenantId } : {};
    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: '$jobTitle',
          userIds: { $addToSet: '$userId' },
          recCount: { $sum: 1 },
        },
      },
      {
        $project: {
          jobTitle: '$_id',
          userCount: { $size: '$userIds' },
          recCount: 1,
          _id: 0,
        },
      },
      { $sort: { recCount: -1 as const } },
    ];
    return this.recs.aggregate(pipeline).toArray() as Promise<
      { jobTitle: string; userCount: number; recCount: number }[]
    >;
  }

  // ── Batches ──

  async createBatch(batch: RecBatch): Promise<RecBatch> {
    await this.batches.insertOne(toBatchDoc(batch));
    return batch;
  }

  async getBatchById(id: string): Promise<RecBatch | undefined> {
    const doc = await this.batches.findOne({ _id: id });
    return doc ? fromBatchDoc(doc) : undefined;
  }

  async updateBatch(id: string, updates: Partial<RecBatch>): Promise<void> {
    const { id: _id, ...rest } = updates;
    if (Object.keys(rest).length === 0) return;
    await this.batches.updateOne({ _id: id }, { $set: rest });
  }

  async listBatches(limit = 50): Promise<RecBatch[]> {
    const docs = await this.batches.find({}).sort({ createdAt: -1 }).limit(limit).toArray();
    return docs.map(fromBatchDoc);
  }

  async listBatchesByTenant(tenantId: string, limit = 50): Promise<RecBatch[]> {
    const docs = await this.batches
      .find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map(fromBatchDoc);
  }

  async getLastBatch(tenantId?: string): Promise<RecBatch | undefined> {
    const filter = tenantId ? { tenantId } : {};
    const doc = await this.batches.findOne(filter, { sort: { createdAt: -1 } });
    return doc ? fromBatchDoc(doc) : undefined;
  }
}
