import type { MemoryExtraction, MemoryExtractionJob, MemoryFact } from '@aijourney/shared';
import { generateId, nowISO } from '@aijourney/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { MemoryRepository } from './memory.repository';

const EXTRACTION_MODEL = 'gpt-5.4';
const MAX_INPUT_LENGTH = 4000; // Truncate long inputs
const HIGH_REASONING = { effort: 'high' as const };

@Injectable()
export class MemoryExtractionService {
  private readonly logger = new Logger(MemoryExtractionService.name);
  private openaiClient: OpenAI | null = null;

  constructor(
    @Inject(MemoryRepository)
    private readonly repo: MemoryRepository,
  ) {}

  private getClient(): OpenAI {
    if (!this.openaiClient) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
      }
      this.openaiClient = new OpenAI({ apiKey });
    }
    return this.openaiClient;
  }

  /**
   * Extract facts from a user interaction and store them.
   * Called by the BullMQ worker.
   */
  async extractAndStore(job: MemoryExtractionJob): Promise<MemoryExtraction> {
    const start = Date.now();
    const extractionId = generateId();
    const truncatedInput = job.userInput.substring(0, MAX_INPUT_LENGTH);

    try {
      // Get existing facts for deduplication context
      const existingFacts = await this.repo.getFactsByUser(job.userId);
      const existingFactTexts = existingFacts.map((f) => `- [${f.category}] ${f.fact}`).join('\n');

      const systemMessage = `You are a fact extraction assistant. Your job is to extract personal facts about the user from their input that would help personalize their AI experience in the future.

RULES:
- Extract ONLY facts about the USER — their preferences, goals, skills, work context, personality traits
- Do NOT extract facts about AI, ChatGPT, or the system
- Each fact should be a short, standalone statement (max 20 words)
- Categorize each fact into exactly one category:
  - "preferences": how they like things done, style preferences, communication style
  - "goals": what they're trying to achieve, their objectives, projects
  - "skills": what they're good at, their expertise, experience level
  - "context": their job, team, company, industry, current situation
  - "personality": how they think, their values, working style
- Deduplicate: do NOT extract facts that are already known (see existing facts below)
- If a fact updates/corrects an existing one, include the old fact's text in "supersedes"
- If there are no new facts, return an empty array
- Return 0-5 facts maximum per extraction

${existingFactTexts ? `EXISTING FACTS (do not duplicate):\n${existingFactTexts}` : 'No existing facts yet.'}

Respond in this exact JSON format (no markdown, no code fences):
[
  { "fact": "...", "category": "...", "supersedes": null }
]

Where "supersedes" is either null or the exact text of an existing fact that this new fact updates/replaces.`;

      const response = await this.getClient().responses.create({
        model: EXTRACTION_MODEL,
        reasoning: HIGH_REASONING,
        max_output_tokens: 12000,
        instructions: systemMessage,
        input: `Source: ${job.source}\nUser input:\n${truncatedInput}`,
      });

      const content = response.output_text?.trim();
      if (!content) {
        return this.recordExtraction(extractionId, job, 0, start, 'completed');
      }

      const cleaned = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      const extracted = JSON.parse(cleaned) as Array<{
        fact: string;
        category: string;
        supersedes: string | null;
      }>;

      if (!Array.isArray(extracted) || extracted.length === 0) {
        return this.recordExtraction(extractionId, job, 0, start, 'completed');
      }

      // Process extracted facts
      const newFacts: MemoryFact[] = [];
      for (const item of extracted.slice(0, 5)) {
        const factId = generateId();

        // Handle superseding
        if (item.supersedes) {
          const oldFact = existingFacts.find((f) => f.fact === item.supersedes);
          if (oldFact) {
            await this.repo.supersedeFact(oldFact.id, factId);
          }
        }

        newFacts.push({
          id: factId,
          userId: job.userId,
          fact: item.fact,
          category: item.category as MemoryFact['category'],
          source: job.source,
          sourceExcerpt: truncatedInput.substring(0, 200),
          createdAt: nowISO(),
        });
      }

      await this.repo.createManyFacts(newFacts);

      this.logger.log(
        `Extracted ${newFacts.length} facts for user ${job.userId} from ${job.source}`,
      );

      return this.recordExtraction(extractionId, job, newFacts.length, start, 'completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Fact extraction failed for user ${job.userId}: ${message}`);
      return this.recordExtraction(extractionId, job, 0, start, 'failed', message);
    }
  }

  private async recordExtraction(
    id: string,
    job: MemoryExtractionJob,
    factsExtracted: number,
    startTime: number,
    status: 'completed' | 'failed',
    error?: string,
  ): Promise<MemoryExtraction> {
    const extraction: MemoryExtraction = {
      id,
      userId: job.userId,
      source: job.source,
      factsExtracted,
      inputLength: job.userInput.length,
      processedAt: nowISO(),
      durationMs: Date.now() - startTime,
      status,
      ...(error && { error }),
    };
    await this.repo.createExtraction(extraction);
    return extraction;
  }
}
