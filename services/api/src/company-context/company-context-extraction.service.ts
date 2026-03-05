import type { CompanyFact, CompanyFactCategory } from "@aijourney/shared";
import { generateId } from "@aijourney/shared";
import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";

const EXTRACTION_MODEL = "gpt-5.2-mini";
const MAX_INPUT_LENGTH = 100_000; // Truncate to ~100K chars

@Injectable()
export class CompanyContextExtractionService {
	private readonly logger = new Logger(CompanyContextExtractionService.name);
	private openaiClient: OpenAI | null = null;

	private getClient(): OpenAI {
		if (!this.openaiClient) {
			const apiKey = process.env.OPENAI_API_KEY;
			if (!apiKey) {
				throw new Error("OPENAI_API_KEY environment variable is not set");
			}
			this.openaiClient = new OpenAI({ apiKey });
		}
		return this.openaiClient;
	}

	/**
	 * Extract structured company facts from document text content.
	 */
	async extractFacts(documentText: string): Promise<CompanyFact[]> {
		const truncated = documentText.substring(0, MAX_INPUT_LENGTH);

		this.logger.log(
			`Extracting facts from document (${truncated.length} chars)`,
		);

		const response = await this.getClient().chat.completions.create({
			model: EXTRACTION_MODEL,
			max_completion_tokens: 16000,
			response_format: { type: "json_object" },
			messages: [
				{
					role: "system",
					content: `You are a company knowledge extraction assistant. You will receive the text content of a company document.

Extract ALL relevant facts about this company that would help an AI assistant provide better, more contextual responses to employees of this company.

Categories:
- "products": Products, services, or offerings the company provides
- "industry": Industry, market, competitors, domain expertise
- "culture": Company culture, values, communication style, work practices
- "strategy": Business goals, strategic priorities, OKRs, initiatives
- "processes": Internal processes, tools, workflows, methodologies
- "terminology": Company-specific jargon, acronyms, product names
- "other": Any other relevant company facts

Rules:
- Each fact should be a standalone statement (max 50 words)
- Be specific — include names, numbers, and concrete details
- Deduplicate — don't repeat the same fact in different words
- Extract 5-50 facts depending on document richness
- If the document has no useful company information, return an empty array

Respond with a JSON object: { "facts": [{ "category": "...", "fact": "..." }, ...] }`,
				},
				{
					role: "user",
					content: `Here is the document content to analyze:\n\n${truncated}`,
				},
			],
		});

		const content = response.choices[0]?.message?.content?.trim();
		if (!content) {
			this.logger.warn("Empty response from extraction LLM");
			return [];
		}

		try {
			const parsed = JSON.parse(content) as {
				facts: { category: string; fact: string }[];
			};
			if (!Array.isArray(parsed.facts)) {
				this.logger.warn("Extraction returned non-array facts");
				return [];
			}

			const validCategories = new Set([
				"products",
				"industry",
				"culture",
				"strategy",
				"processes",
				"terminology",
				"other",
			]);

			return parsed.facts
				.filter(
					(f) =>
						typeof f.fact === "string" &&
						f.fact.trim().length > 0 &&
						validCategories.has(f.category),
				)
				.map((f) => ({
					id: generateId(),
					category: f.category as CompanyFactCategory,
					fact: f.fact.trim(),
				}));
		} catch (err) {
			this.logger.error(
				`Failed to parse extraction response: ${content.slice(0, 200)}`,
			);
			throw new Error(
				`Failed to parse extraction response: ${(err as Error).message}`,
			);
		}
	}

	/**
	 * Parse text content from a document buffer based on MIME type.
	 */
	async parseDocumentText(buffer: Buffer, mimeType: string): Promise<string> {
		switch (mimeType) {
			case "text/plain":
			case "text/markdown":
				return buffer.toString("utf-8");

			case "application/pdf": {
				// pdf-parse v2: class-based API
				const { PDFParse } = await import("pdf-parse");
				const parser = new PDFParse({ data: buffer });
				const result = await parser.getText();
				await parser.destroy();
				return result.text;
			}

			case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
				// Dynamic import for mammoth
				const mammoth = await import("mammoth");
				const result = await mammoth.extractRawText({ buffer });
				return result.value;
			}

			default:
				throw new Error(`Unsupported MIME type: ${mimeType}`);
		}
	}
}
