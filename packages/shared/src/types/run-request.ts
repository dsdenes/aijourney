import type { RunPurpose, RunStatus } from '../constants/run-states.js';

export interface RunInputs {
  prompt?: string;
  promptHash: string;
  context?: Record<string, unknown>;
  sourceDocIds?: string[];
}

export interface RunBudget {
  maxTokens: number;
  maxDurationMs: number;
  estimatedCostUsd: number;
}

export interface RunApproval {
  requiredApproval: boolean;
  approvedBy?: string;
  approvedAt?: string;
  autoApproved: boolean;
}

export interface RunExecution {
  startedAt: string;
  completedAt?: string;
  actualTokensUsed: number;
  actualDurationMs: number;
  actualCostUsd: number;
  model: string;
  modelVersion: string;
  outputRef?: string;
  error?: string;
}

export interface RunRequest {
  id: string;
  userId: string;
  purpose: RunPurpose;
  status: RunStatus;
  inputs: RunInputs;
  budget: RunBudget;
  approval: RunApproval;
  execution?: RunExecution;
  cancelledBy?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}
