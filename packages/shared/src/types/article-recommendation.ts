/**
 * Article Recommendation types.
 *
 * Twice per week, the system:
 * 1. Finds 10 candidate articles per active job title via RAG
 * 2. For each user, calls LLM with candidates + user memory to pick exactly 1 article
 * → Total: 2 personalized article recommendations per user per week
 */

export const ARTICLE_REC_STATUSES = ['pending', 'read', 'dismissed'] as const;
export type ArticleRecStatus = (typeof ARTICLE_REC_STATUSES)[number];

export const REC_BATCH_STATUSES = [
  'pending',
  'fetching_articles',
  'selecting_articles',
  'completed',
  'failed',
] as const;
export type RecBatchStatus = (typeof REC_BATCH_STATUSES)[number];

/** A single article recommended to a specific user */
export interface ArticleRecommendation {
  id: string;
  tenantId: string;
  userId: string;
  batchId: string;
  /** Job title this recommendation was based on */
  jobTitle: string;
  /** Article info from RAG */
  article: {
    url: string;
    title: string;
    source: string;
    summary: string;
    tags: string[];
    difficulty: string;
  };
  /** LLM's reasoning for picking this article */
  reason: string;
  status: ArticleRecStatus;
  readAt?: string;
  dismissedAt?: string;
  createdAt: string;
}

/** Candidate articles fetched from RAG for a specific job title */
export interface JobTitleCandidates {
  jobTitle: string;
  userCount: number;
  articles: CandidateArticle[];
  fetchedAt: string;
}

export interface CandidateArticle {
  url: string;
  title: string;
  source: string;
  summary: string;
  tags: string[];
  difficulty: string;
  ragScore: number;
}

/** A batch run — one per scheduled trigger (twice per week) */
export interface RecBatch {
  id: string;
  tenantId: string;
  status: RecBatchStatus;
  /** Job titles processed in this batch */
  jobTitles: string[];
  /** Candidates per job title */
  candidates: JobTitleCandidates[];
  /** Stats */
  totalUsers: number;
  totalRecommendations: number;
  /** Timing */
  startedAt: string;
  completedAt?: string;
  /** Error if failed */
  error?: string;
  /** Agent run IDs for tracking */
  agentRunIds: string[];
  createdAt: string;
}

/** Admin stats for the recommendations system */
export interface RecAdminStats {
  totalBatches: number;
  totalRecommendations: number;
  readCount: number;
  dismissedCount: number;
  pendingCount: number;
  readRate: number;
  lastBatch?: {
    id: string;
    status: RecBatchStatus;
    completedAt?: string;
    totalRecommendations: number;
  };
  jobTitleStats: {
    jobTitle: string;
    userCount: number;
    recCount: number;
  }[];
}
