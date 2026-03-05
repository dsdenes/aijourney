import type { CompanyDocExtractionStatus, CompanyDocument, CompanyFact } from '@aijourney/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { Db } from 'mongodb';
import { MONGODB_DB } from '../mongodb/mongodb.module';

interface DocRow {
  _id: string;
  [key: string]: unknown;
}

function toDoc(doc: CompanyDocument): DocRow {
  const { id, ...rest } = doc;
  return { _id: id, ...rest } as DocRow;
}

function fromDoc(row: DocRow): CompanyDocument {
  const { _id, ...rest } = row;
  return { id: _id, ...rest } as CompanyDocument;
}

@Injectable()
export class CompanyContextRepository {
  private readonly col;

  constructor(@Inject(MONGODB_DB) db: Db) {
    this.col = db.collection<DocRow>('company_documents');
  }

  async create(doc: CompanyDocument): Promise<CompanyDocument> {
    await this.col.insertOne(toDoc(doc));
    return doc;
  }

  async getById(tenantId: string, docId: string): Promise<CompanyDocument | undefined> {
    const row = await this.col.findOne({ _id: docId, tenantId });
    return row ? fromDoc(row) : undefined;
  }

  async listByTenant(tenantId: string): Promise<CompanyDocument[]> {
    const rows = await this.col.find({ tenantId }).sort({ createdAt: -1 }).toArray();
    return rows.map(fromDoc);
  }

  async countByTenant(tenantId: string): Promise<number> {
    return this.col.countDocuments({ tenantId });
  }

  async updateExtractionStatus(docId: string, status: CompanyDocExtractionStatus): Promise<void> {
    await this.col.updateOne(
      { _id: docId },
      {
        $set: {
          extractionStatus: status,
          updatedAt: new Date().toISOString(),
        },
      },
    );
  }

  async updateExtractionResult(docId: string, facts: CompanyFact[]): Promise<void> {
    await this.col.updateOne(
      { _id: docId },
      {
        $set: {
          extractedFacts: facts,
          extractionStatus: 'completed' as CompanyDocExtractionStatus,
          extractionError: undefined,
          lastExtractedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    );
  }

  async updateExtractionError(docId: string, error: string): Promise<void> {
    await this.col.updateOne(
      { _id: docId },
      {
        $set: {
          extractionStatus: 'failed' as CompanyDocExtractionStatus,
          extractionError: error,
          lastExtractedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    );
  }

  async delete(tenantId: string, docId: string): Promise<boolean> {
    const result = await this.col.deleteOne({ _id: docId, tenantId });
    return result.deletedCount > 0;
  }

  async getAllFactsByTenant(tenantId: string): Promise<CompanyFact[]> {
    const rows = await this.col
      .find({ tenantId, extractionStatus: 'completed' })
      .project<{ extractedFacts: CompanyFact[] }>({ extractedFacts: 1 })
      .toArray();
    return rows.flatMap((r) => r.extractedFacts || []);
  }

  /** Reset a document for re-extraction */
  async resetForExtraction(docId: string): Promise<void> {
    await this.col.updateOne(
      { _id: docId },
      {
        $set: {
          extractedFacts: [],
          extractionStatus: 'pending' as CompanyDocExtractionStatus,
          extractionError: undefined,
          updatedAt: new Date().toISOString(),
        },
      },
    );
  }
}
