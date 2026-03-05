import type { Summary } from '@aijourney/shared';
import { generateId, nowISO } from '@aijourney/shared';
import { getDb } from './db.js';

interface SummaryDoc {
  _id: string;
  [key: string]: unknown;
}

function toDoc(summary: Summary): SummaryDoc {
  const { id, ...rest } = summary;
  return { _id: id, ...rest } as SummaryDoc;
}

function fromDoc(doc: SummaryDoc): Summary {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Summary;
}

function col() {
  return getDb().collection<SummaryDoc>('summaries');
}

export async function saveSummary(summary: Omit<Summary, 'id' | 'createdAt'>): Promise<Summary> {
  const item: Summary = {
    ...summary,
    id: generateId(),
    createdAt: nowISO(),
  };
  await col().insertOne(toDoc(item));
  return item;
}

export async function getSummaryByArticleId(articleId: string): Promise<Summary | null> {
  const doc = await col().findOne({ articleId });
  return doc ? fromDoc(doc) : null;
}

export async function getSummaryById(id: string): Promise<Summary | null> {
  const doc = await col().findOne({ _id: id });
  return doc ? fromDoc(doc) : null;
}

export async function getAllSummaries(): Promise<Summary[]> {
  const docs = await col().find({}).sort({ createdAt: -1 }).toArray();
  return docs.map((d) => fromDoc(d));
}

export async function countSummaries(): Promise<number> {
  return col().countDocuments({});
}

export async function deleteSummaryById(id: string): Promise<void> {
  await col().deleteOne({ _id: id });
}

export async function deleteSummaryByArticleId(articleId: string): Promise<boolean> {
  const result = await col().deleteOne({ articleId });
  return result.deletedCount > 0;
}
