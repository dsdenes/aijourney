import type { ArticleStatus } from '../constants/journey-levels.js';

export interface ArticleMetadata {
  publishedAt?: string;
  author?: string;
  wordCount: number;
  language: string;
  tags?: string[];
}

export interface ArticleDedupe {
  isDuplicate: boolean;
  similarTo?: string;
  similarityScore?: number;
}

export interface Article {
  id: string;
  url: string;
  title: string;
  source: string;
  fetchedAt: string;
  contentHash: string;
  s3Key: string;
  status: ArticleStatus;
  qualityScore?: number;
  metadata: ArticleMetadata;
  dedupe: ArticleDedupe;
  ingestionRunId?: string;
  createdAt: string;
  updatedAt: string;
}
