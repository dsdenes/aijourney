import type { DifficultyLevel } from '../constants/journey-levels.js';

export interface SummaryRoleRelevance {
  role: string;
  relevanceScore: number;
}

export interface SummaryCitation {
  text: string;
  sourceSection: string;
}

export interface SummaryContent {
  title: string;
  keyPoints: string[];
  dos: string[];
  donts: string[];
  tags: string[];
  difficulty: DifficultyLevel;
  roleRelevance: SummaryRoleRelevance[];
  citations: SummaryCitation[];
  /** 0.0-1.0: how relevant this article is to workplace AI adoption */
  relevanceScore?: number;
  /** Brief explanation of why this article is or isn't relevant */
  relevanceReason?: string;
}

export interface Summary {
  id: string;
  articleId: string;
  runRequestId: string;
  version: number;
  content: SummaryContent;
  bedrockKbDocId?: string;
  model: string;
  promptVersion: string;
  tokensUsed: number;
  promptTokens?: number;
  completionTokens?: number;
  createdAt: string;
}
