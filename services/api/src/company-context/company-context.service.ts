import type {
  CompanyContextState,
  CompanyDocument,
  CompanyFact,
  ResolvedCompanyContext,
} from '@aijourney/shared';
import { generateId, nowISO } from '@aijourney/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../config/config.service';
import { TenantsRepository } from '../tenants/tenants.repository';
import { CompanyContextRepository } from './company-context.repository';
import { CompanyContextExtractionService } from './company-context-extraction.service';
import { CompanyDocumentStorageService } from './company-document-storage.service';

const MAX_DOCUMENTS = 20;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const CACHE_TTL_SECONDS = 300; // 5 minutes
const CACHE_KEY_PREFIX = 'company-context:';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]);

@Injectable()
export class CompanyContextService {
  private readonly logger = new Logger(CompanyContextService.name);
  private redis: Redis | null = null;

  constructor(
    @Inject(CompanyContextRepository)
    private readonly repo: CompanyContextRepository,
    @Inject(TenantsRepository)
    private readonly tenantsRepo: TenantsRepository,
    @Inject(CompanyDocumentStorageService)
    private readonly storage: CompanyDocumentStorageService,
    @Inject(CompanyContextExtractionService)
    private readonly extraction: CompanyContextExtractionService,
    @Inject(AppConfigService)
    private readonly configService: AppConfigService,
  ) {
    try {
      const redisUrl = this.configService.config.REDIS_URL;
      this.redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
      this.redis.connect().catch(() => {
        this.logger.warn('Redis not available — caching disabled');
        this.redis = null;
      });
    } catch {
      this.logger.warn('Redis not available — caching disabled');
    }
  }

  // ─── Admin: Get State ───────────────────────────────────────────

  async getState(tenantId: string): Promise<CompanyContextState> {
    const [tenant, documents] = await Promise.all([
      this.tenantsRepo.getById(tenantId),
      this.repo.listByTenant(tenantId),
    ]);
    return {
      freeText: tenant?.companyContext || '',
      documents,
    };
  }

  // ─── Admin: Update Free-Text ────────────────────────────────────

  async updateFreeText(tenantId: string, text: string): Promise<void> {
    await this.tenantsRepo.update(tenantId, {
      companyContext: text,
    });
    await this.invalidateCache(tenantId);
  }

  // ─── Admin: Upload Document ─────────────────────────────────────

  async uploadDocument(
    tenantId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ): Promise<CompanyDocument> {
    // Validate MIME
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new Error(`Unsupported file type: ${file.mimetype}. Allowed: PDF, DOCX, TXT, MD`);
    }
    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Max 10 MB.`);
    }
    // Validate count
    const count = await this.repo.countByTenant(tenantId);
    if (count >= MAX_DOCUMENTS) {
      throw new Error(`Maximum ${MAX_DOCUMENTS} documents per organization.`);
    }

    const docId = generateId();
    const now = nowISO();

    // Upload to Scaleway
    const storageKey = await this.storage.upload(
      tenantId,
      docId,
      file.originalname,
      file.buffer,
      file.mimetype,
    );

    const doc: CompanyDocument = {
      id: docId,
      tenantId,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storageKey,
      extractionStatus: 'pending',
      extractedFacts: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.repo.create(doc);

    // Fire-and-forget extraction
    this.runExtraction(tenantId, docId).catch((err) => {
      this.logger.error(`Background extraction failed for ${docId}: ${(err as Error).message}`);
    });

    return doc;
  }

  // ─── Admin: Delete Document ─────────────────────────────────────

  async deleteDocument(tenantId: string, docId: string): Promise<void> {
    const doc = await this.repo.getById(tenantId, docId);
    if (!doc) {
      throw new Error('Document not found');
    }

    // Delete from storage
    try {
      await this.storage.delete(doc.storageKey);
    } catch (err) {
      this.logger.warn(
        `Failed to delete storage object ${doc.storageKey}: ${(err as Error).message}`,
      );
    }

    await this.repo.delete(tenantId, docId);
    await this.invalidateCache(tenantId);
  }

  // ─── Admin: Re-extract ──────────────────────────────────────────

  async reExtract(tenantId: string, docId: string): Promise<CompanyDocument> {
    const doc = await this.repo.getById(tenantId, docId);
    if (!doc) {
      throw new Error('Document not found');
    }

    await this.repo.resetForExtraction(docId);

    // Fire-and-forget
    this.runExtraction(tenantId, docId).catch((err) => {
      this.logger.error(`Re-extraction failed for ${docId}: ${(err as Error).message}`);
    });

    return { ...doc, extractionStatus: 'pending', extractedFacts: [] };
  }

  // ─── Extraction Pipeline ────────────────────────────────────────

  private async runExtraction(tenantId: string, docId: string): Promise<void> {
    try {
      await this.repo.updateExtractionStatus(docId, 'processing');

      const doc = await this.repo.getById(tenantId, docId);
      if (!doc) {
        throw new Error('Document not found during extraction');
      }

      // Download from storage
      const buffer = await this.storage.download(doc.storageKey);

      // Parse text
      const text = await this.extraction.parseDocumentText(buffer, doc.mimeType);

      if (!text || text.trim().length === 0) {
        throw new Error('No text content could be extracted from the document');
      }

      // Extract facts via LLM
      const facts = await this.extraction.extractFacts(text);

      // Save results
      await this.repo.updateExtractionResult(docId, facts);
      await this.invalidateCache(tenantId);

      this.logger.log(`Extraction complete for doc ${docId}: ${facts.length} facts`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Extraction failed for doc ${docId}: ${msg}`);
      await this.repo.updateExtractionError(docId, msg);
    }
  }

  // ─── Context Resolution (for injection into LLM calls) ─────────

  /**
   * Get the resolved company context for a tenant.
   * Cached in Redis for 5 minutes.
   */
  async getResolvedContext(tenantId: string): Promise<ResolvedCompanyContext> {
    // Try cache first
    const cached = await this.getFromCache(tenantId);
    if (cached) return cached;

    const [tenant, facts] = await Promise.all([
      this.tenantsRepo.getById(tenantId),
      this.repo.getAllFactsByTenant(tenantId),
    ]);

    const resolved: ResolvedCompanyContext = {
      freeText: tenant?.companyContext || '',
      facts,
    };

    await this.setCache(tenantId, resolved);
    return resolved;
  }

  /**
   * Format company context for injection into an LLM system prompt.
   * Returns empty string if there's no company context.
   */
  async getFormattedContext(tenantId: string): Promise<string> {
    if (!tenantId) return '';

    const ctx = await this.getResolvedContext(tenantId);

    if (!ctx.freeText && ctx.facts.length === 0) return '';

    let result = '\n## Company Context\n';

    if (ctx.freeText) {
      result += `\n### About the Company\n${ctx.freeText}\n`;
    }

    if (ctx.facts.length > 0) {
      result += '\n### Key Company Facts\n';

      // Group facts by category
      const grouped = new Map<string, CompanyFact[]>();
      for (const f of ctx.facts) {
        const existing = grouped.get(f.category) || [];
        existing.push(f);
        grouped.set(f.category, existing);
      }

      for (const [category, facts] of grouped) {
        const label = category.charAt(0).toUpperCase() + category.slice(1);
        result += `\n**${label}**:\n`;
        for (const f of facts) {
          result += `- ${f.fact}\n`;
        }
      }
    }

    return result;
  }

  // ─── Cache helpers ──────────────────────────────────────────────

  private async getFromCache(tenantId: string): Promise<ResolvedCompanyContext | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(`${CACHE_KEY_PREFIX}${tenantId}`);
      if (raw) return JSON.parse(raw);
    } catch {
      // Ignore cache errors
    }
    return null;
  }

  private async setCache(tenantId: string, ctx: ResolvedCompanyContext): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.setex(
        `${CACHE_KEY_PREFIX}${tenantId}`,
        CACHE_TTL_SECONDS,
        JSON.stringify(ctx),
      );
    } catch {
      // Ignore cache errors
    }
  }

  private async invalidateCache(tenantId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(`${CACHE_KEY_PREFIX}${tenantId}`);
    } catch {
      // Ignore cache errors
    }
  }
}
