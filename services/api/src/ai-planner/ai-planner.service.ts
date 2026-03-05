import type {
	PlannerAnswer,
	PlannerQuestion,
	PlannerRound,
	PlannerStrategy,
} from "@aijourney/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { CompanyContextService } from "../company-context/company-context.service";
import { AppConfigService } from "../config/config.service";
import { QuotaService } from "../quotas/quotas.service";

const QUESTIONS_MODEL = "grok-4-1-fast-reasoning";
const STRATEGY_MODEL = "gpt-5.2";

@Injectable()
export class AiPlannerService {
	private readonly logger = new Logger(AiPlannerService.name);
	private grokClient: OpenAI | null = null;
	private openaiClient: OpenAI | null = null;

	constructor(
		@Inject(AppConfigService)
		private readonly configService: AppConfigService,
		@Inject(QuotaService)
		private readonly quotaService: QuotaService,
		@Inject(CompanyContextService)
		private readonly companyContextService: CompanyContextService,
	) {}

	private getGrokClient(): OpenAI {
		if (!this.grokClient) {
			const apiKey = process.env.GROK_API_KEY;
			if (!apiKey) {
				throw new Error("GROK_API_KEY environment variable is not set");
			}
			this.grokClient = new OpenAI({
				apiKey,
				baseURL: "https://api.x.ai/v1",
			});
		}
		return this.grokClient;
	}

	private getOpenAIClient(): OpenAI {
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
	 * Generate 6 true/false specification questions for a given round.
	 */
	async generateQuestions(
		goal: string,
		round: PlannerRound,
		previousAnswers: PlannerAnswer[],
		tenantId?: string,
	): Promise<PlannerQuestion[]> {
		const previousContext =
			previousAnswers.length > 0
				? `\n\nThe user already answered these specification questions:\n${previousAnswers
						.map((a) => {
							let line = `- "${a.question}" → ${a.answer ? "YES" : "NO"}`;
							if (a.context) line += ` (user note: "${a.context}")`;
							return line;
						})
						.join(
							"\n",
						)}\n\nDo NOT repeat any of the above questions. Build on what you already know from the answers to ask deeper, more specific questions.`
				: "";

		const roundLabels: Record<PlannerRound, string> = {
			1: "understanding the big picture — who is involved, what the goal is, how urgent it is, and what success looks like",
			2: "getting more specific — based on what you know, ask about boundaries, preferences, quality expectations, and how the results will be used",
			3: "final details — ask about special situations, what the finished result should look like, and any remaining concerns",
		};

		const systemMessage = `You are a friendly AI planning consultant. The user is a NON-TECHNICAL person who CANNOT code or build software. They want to use ChatGPT to help with a project by copy-pasting prompts. Your job is to ask exactly 6 yes/no questions to understand what they need.

This is round ${round} of 3. Focus on: ${roundLabels[round]}.${previousContext}

Rules:
- Generate EXACTLY 6 questions
- Each question MUST be a simple yes/no statement (checking it means YES)
- Use plain, everyday language a 12-year-old would understand
- NEVER use technical words like: API, deploy, code, script, database, server, framework, model, integration, pipeline, configure, SDK, CLI
- Focus on what the person wants to ACHIEVE — not how to build it
- Think about: who will see the results, how often they need it, what format they want, how important quality vs speed is, who else is involved
- Do NOT repeat any previously asked questions
- Keep each question under 15 words

Examples of GOOD questions:
- "More than 10 people will use this regularly."
- "The results need to look professional and polished."
- "Getting this done quickly matters more than perfection."
- "Other people on your team will help with this."

Examples of BAD questions:
- "Do you need a REST API integration?" ← technical jargon
- "Should the model support fine-tuning?" ← the user doesn't know what this means
- "Is low-latency inference a requirement?" ← too technical

Respond in this exact JSON format (no markdown, no code fences):
[
  { "id": 1, "question": "..." },
  { "id": 2, "question": "..." },
  { "id": 3, "question": "..." },
  { "id": 4, "question": "..." },
  { "id": 5, "question": "..." },
  { "id": 6, "question": "..." }
]`;

		// Inject company context if available
		let fullSystemMessage = systemMessage;
		if (tenantId) {
			const companyCtx = await this.companyContextService.getFormattedContext(tenantId);
			if (companyCtx) {
				fullSystemMessage += `\n${companyCtx}`;
			}
		}

		this.logger.debug(
			`Generating round ${round} questions for goal: ${goal.substring(0, 80)}...`,
		);

		const response = await this.getGrokClient().chat.completions.create({
			model: QUESTIONS_MODEL,
			messages: [
				{ role: "system", content: fullSystemMessage },
				{ role: "user", content: `My project goal:\n\n${goal}` },
			],
			max_completion_tokens: 8000,
		});

		const content = response.choices[0]?.message?.content?.trim();
		if (!content) throw new Error("Empty response from Grok");

		this.logger.debug(`Round ${round} response: ${content.substring(0, 200)}`);

		try {
			const cleaned = content
				.replace(/^```(?:json)?\s*/, "")
				.replace(/\s*```$/, "");
			const questions = JSON.parse(cleaned) as PlannerQuestion[];
			if (!Array.isArray(questions) || questions.length !== 6) {
				throw new Error(
					`Expected 6 questions, got ${Array.isArray(questions) ? questions.length : "non-array"}`,
				);
			}
			return questions;
		} catch (err) {
			this.logger.error(`Failed to parse questions response: ${content}`);
			throw new Error(
				`Failed to parse specification questions: ${(err as Error).message}`,
			);
		}
	}

	/**
	 * Generate the final AI usage strategy using gpt-5.2 with high reasoning.
	 */
	async generateStrategy(
		goal: string,
		allAnswers: PlannerAnswer[],
		feedback?: string,
		tenantId?: string,
	): Promise<PlannerStrategy> {
		const specificationsText = allAnswers
			.map((a) => `- "${a.question}" → ${a.answer ? "YES" : "NO"}`)
			.join("\n");

		const feedbackBlock = feedback
			? `\n\nUser feedback on a previous plan (incorporate this):\n${feedback}`
			: "";

		const systemMessage = `You are a friendly AI advisor helping a NON-TECHNICAL person who CANNOT code, program, or build anything technical. They can ONLY copy-paste prompts into ChatGPT. They have a ChatGPT Pro account with access to all models.

CRITICAL RULES:
- Every step must be achievable by pasting a prompt into ChatGPT
- NEVER suggest coding, scripting, deploying, using APIs, databases, terminals, or any technical tool
- NEVER use technical jargon. The user reads ChatGPT's answer and that's it
- Always set "tool" to "chatgpt"
- Prompts must be fully ready to paste — no blanks or placeholders

MODEL SELECTION (for each step, recommend the best ChatGPT model):
Available models the user can select in ChatGPT Pro:
- "GPT-5.2" — best all-around model, fast, great for writing, formatting, translation, everyday tasks
- "GPT-5.2 with Extended Thinking" — uses deep reasoning before answering, best for complex analysis, strategy, planning, multi-step logic, data interpretation
- "GPT-5.2 with Canvas" — best when the user needs to iteratively edit a document, article, or long-form content collaboratively
- "GPT-4o" — good for quick simple tasks, image understanding, and when speed matters most
- "o3 Pro" — maximum reasoning power, use ONLY for extremely complex analytical tasks (math, logic puzzles, deep research synthesis)

Guidelines for model selection:
- Default to "GPT-5.2" for most tasks (writing, brainstorming, formatting, translation)
- Use "GPT-5.2 with Extended Thinking" for steps requiring analysis, planning, comparison, evaluation, or multi-step reasoning
- Use "GPT-5.2 with Canvas" ONLY for steps where the user will iterate on a long document
- Use "o3 Pro" ONLY for extremely complex analytical or mathematical tasks
- Use "GPT-4o" for quick image-related or very simple tasks
- In "recommendedModel" put the exact model name, in "modelReason" explain in 1 short sentence WHY this model is best for this specific step

STEP COUNT:
- Choose the RIGHT number of steps for the task complexity (1–8 steps)
- For simple tasks (e.g. "write an email"), use 1–2 steps
- For moderate tasks, use 3–4 steps
- For complex multi-part tasks, use 5–8 steps
- NEVER pad with unnecessary steps — each must add real value

PLAN QUALITY:
- "startingState": describe what the user currently has (e.g. "You have a rough idea of what you want to say" or "You have sales data in a spreadsheet")
- Each step's "inputArtifacts" must describe what the user has BEFORE this step (e.g. "ChatGPT's draft from Step 1")
- Each step's "outputArtifacts" must describe what the user will RECEIVE after this step (e.g. "A polished email ready to send"), plus clear instructions on what to DO with the output (save it, copy it, use it in the next step, etc.)
- Steps must logically connect: the output of step N must be the input of step N+1
- "endResult": describe the COMPLETE output of the entire process
- "nextSteps": suggest what the user can do after completing this plan

INTERNAL VERIFICATION (do this before outputting):
- Verify that each step's input matches the previous step's output
- Verify that following all steps actually achieves the stated goal
- Verify the plan is feasible for a non-technical person

Respond in this exact JSON format (no markdown, no code fences):
{
  "title": "<plan title, 5-8 words>",
  "summary": "<1-2 sentence summary of what they'll accomplish>",
  "startingState": "<what the user currently has>",
  "endResult": "<what the user will have after completing all steps>",
  "nextSteps": "<suggested next actions after the plan>",
  "tool": "chatgpt",
  "steps": [{
    "order": 1,
    "title": "<friendly step name>",
    "description": "<1 sentence: what they get>",
    "inputArtifacts": "<what you have before this step>",
    "outputArtifacts": "<what you'll receive + what to do with it>",
    "prompt": "<80-200 word ready-to-paste prompt, no placeholders>",
    "recommendedModel": "<exact model name from the list above>",
    "modelReason": "<1 sentence: why this model is best for this step>"
  }]
}`;

		// Inject company context if available
		let fullStrategySystemMessage = systemMessage;
		if (tenantId) {
			const companyCtx = await this.companyContextService.getFormattedContext(tenantId);
			if (companyCtx) {
				fullStrategySystemMessage += `\n${companyCtx}`;
			}
		}

		this.logger.debug(
			`Generating strategy with gpt-5.2 for goal: ${goal.substring(0, 80)}...`,
		);

		const requestBody = {
			model: STRATEGY_MODEL,
			messages: [
				{ role: "system" as const, content: fullStrategySystemMessage },
				{
					role: "user" as const,
					content: `Project Goal:\n${goal}\n\nSpecification Answers:\n${specificationsText}${feedbackBlock}`,
				},
			],
			max_completion_tokens: 16000,
			reasoning_effort: "high" as const,
		};
		const response =
			await this.getOpenAIClient().chat.completions.create(requestBody);

		const content = response.choices[0]?.message?.content?.trim();
		if (!content) throw new Error("Empty response from gpt-5.2");

		this.logger.debug(`Strategy response: ${content.substring(0, 200)}`);

		const cleaned = content
			.replace(/^```(?:json)?\s*/, "")
			.replace(/\s*```$/, "");
		const strategy = JSON.parse(cleaned) as PlannerStrategy;

		if (
			!strategy.title ||
			!strategy.steps ||
			!strategy.tool ||
			!strategy.steps[0]?.prompt
		) {
			throw new Error("Invalid strategy format returned from gpt-5.2");
		}

		return strategy;
	}
}
