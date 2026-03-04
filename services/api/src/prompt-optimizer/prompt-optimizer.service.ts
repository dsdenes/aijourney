import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { PROMPTING_PRACTICES_CONTEXT } from "./prompting-practices-context";

const MODEL = "grok-4-1-fast-reasoning";

@Injectable()
export class PromptOptimizerService {
	private readonly logger = new Logger(PromptOptimizerService.name);
	private openai: OpenAI;

	constructor() {
		const apiKey = process.env.GROK_API_KEY;
		if (!apiKey) {
			this.logger.warn(
				"GROK_API_KEY is not set — prompt optimizer will fail at runtime",
			);
		}
		this.openai = new OpenAI({
			apiKey: apiKey || "missing",
			baseURL: "https://api.x.ai/v1",
		});
	}

	/**
	 * Step 1: Assess prompt quality (0–100) and reverse-engineer 3 likely goals.
	 */
	async analyzePrompt(prompt: string): Promise<{
		score: number;
		scoreExplanation: string;
		goals: { id: number; label: string; description: string }[];
	}> {
		const systemMessage = `${PROMPTING_PRACTICES_CONTEXT}

You are an expert prompt quality analyst. The user will give you a prompt they wrote for an AI assistant.

Your job:
1. Score the prompt quality from 0 to 100 based on how well it follows the prompting best practices above. Be fair but honest — most prompts from beginners score 10-40.
2. Provide a brief 1-2 sentence explanation of the score.
3. Reverse-engineer what the user is probably trying to achieve. Come up with EXACTLY 3 distinct, plausible goals they might have — ranging from the most obvious to a more creative interpretation.

Respond in this exact JSON format (no markdown, no code fences):
{
  "score": <number 0-100>,
  "scoreExplanation": "<1-2 sentences>",
  "goals": [
    { "id": 1, "label": "<short 5-8 word label>", "description": "<1 sentence description>" },
    { "id": 2, "label": "<short 5-8 word label>", "description": "<1 sentence description>" },
    { "id": 3, "label": "<short 5-8 word label>", "description": "<1 sentence description>" }
  ]
}`;

		this.logger.debug(`Analyzing prompt: ${prompt.substring(0, 80)}...`);

		const response = await this.openai.chat.completions.create({
			model: MODEL,
			messages: [
				{ role: "system", content: systemMessage },
				{
					role: "user",
					content: `Here is the prompt to analyze:\n\n${prompt}`,
				},
			],
			max_completion_tokens: 8000,
		});

		const content = response.choices[0]?.message?.content?.trim();
		if (!content) throw new Error("Empty response from Grok");

		this.logger.debug(`Analysis response: ${content.substring(0, 200)}`);

		try {
			// Strip markdown code fences if present
			const cleaned = content
				.replace(/^```(?:json)?\s*/, "")
				.replace(/\s*```$/, "");
			return JSON.parse(cleaned);
		} catch {
			this.logger.error(`Failed to parse analysis response: ${content}`);
			throw new Error("Failed to parse prompt analysis response");
		}
	}

	/**
	 * Step 2: Given the original prompt and the chosen goal, optimize the prompt.
	 */
	async optimizePrompt(
		originalPrompt: string,
		goal: string,
	): Promise<{
		optimizedPrompt: string;
		changes: string[];
		newScore: number;
	}> {
		const systemMessage = `${PROMPTING_PRACTICES_CONTEXT}

You are an expert prompt optimizer. The user wrote a prompt and has clarified their goal.

Your job:
1. Rewrite their prompt to be significantly better, applying as many of the 25 prompting best practices above as are relevant.
2. The optimized prompt should be ready to copy-paste directly into any AI tool (ChatGPT, Claude, etc.)
3. List the specific changes/improvements you made.
4. Estimate the new quality score (0-100).

Rules for the optimized prompt:
- Keep it practical and natural — don't make it sound robotic or over-engineered
- Add role, context, format, tone, and constraints where missing
- Include an example if helpful
- Set appropriate length limits
- Break complex tasks into steps if needed
- Make it clear and actionable — a non-technical person should be able to use it

Respond in this exact JSON format (no markdown, no code fences):
{
  "optimizedPrompt": "<the complete improved prompt ready to copy-paste>",
  "changes": ["<change 1>", "<change 2>", "<change 3>", ...],
  "newScore": <number 0-100>
}`;

		this.logger.debug(`Optimizing prompt with goal: ${goal}`);

		const response = await this.openai.chat.completions.create({
			model: MODEL,
			messages: [
				{ role: "system", content: systemMessage },
				{
					role: "user",
					content: `Original prompt:\n"${originalPrompt}"\n\nChosen goal:\n"${goal}"\n\nPlease optimize this prompt for the stated goal.`,
				},
			],
			max_completion_tokens: 8000,
		});

		const content = response.choices[0]?.message?.content?.trim();
		if (!content) throw new Error("Empty response from Grok");

		this.logger.debug(`Optimization response: ${content.substring(0, 200)}`);

		try {
			const cleaned = content
				.replace(/^```(?:json)?\s*/, "")
				.replace(/\s*```$/, "");
			return JSON.parse(cleaned);
		} catch {
			this.logger.error(`Failed to parse optimization response: ${content}`);
			throw new Error("Failed to parse prompt optimization response");
		}
	}
}
