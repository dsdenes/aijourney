import type {
	PlannerAnswer,
	PlannerQuestion,
	PlannerRound,
	PlannerStrategy,
} from "@aijourney/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { AppConfigService } from "../config/config.service";

const QUESTIONS_MODEL = "gpt-5-mini";
const STRATEGY_MODEL = "gpt-5-mini";

@Injectable()
export class AiPlannerService {
	private readonly logger = new Logger(AiPlannerService.name);
	private openai: OpenAI | null = null;

	constructor(
		@Inject(AppConfigService)
		private readonly configService: AppConfigService,
	) {}

	private getOpenAI(): OpenAI {
		if (!this.openai) {
			const apiKey = process.env.OPENAI_API_KEY;
			if (!apiKey) {
				throw new Error("OPENAI_API_KEY environment variable is not set");
			}
			this.openai = new OpenAI({ apiKey });
		}
		return this.openai;
	}

	/**
	 * Generate 6 true/false specification questions for a given round.
	 */
	async generateQuestions(
		goal: string,
		round: PlannerRound,
		previousAnswers: PlannerAnswer[],
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

		this.logger.debug(
			`Generating round ${round} questions for goal: ${goal.substring(0, 80)}...`,
		);

		const response = await this.getOpenAI().chat.completions.create({
			model: QUESTIONS_MODEL,
			messages: [
				{ role: "system", content: systemMessage },
				{
					role: "user",
					content: `My project goal:\n\n${goal}`,
				},
			],
			max_completion_tokens: 8000,
		});

		const content = response.choices[0]?.message?.content?.trim();
		if (!content) throw new Error("Empty response from OpenAI");

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
	 * Generate the final AI usage strategy using OpenAI.
	 */
	async generateStrategy(
		goal: string,
		allAnswers: PlannerAnswer[],
		feedback?: string,
	): Promise<PlannerStrategy> {
		const specificationsText = allAnswers
			.map((a) => `- "${a.question}" → ${a.answer ? "YES" : "NO"}`)
			.join("\n");

		const feedbackBlock = feedback
			? `\n\nUser feedback on a previous plan (incorporate this):\n${feedback}`
			: "";

		const systemMessage = `You are a friendly AI advisor helping a NON-TECHNICAL person who CANNOT code, program, or build anything technical. They can ONLY copy-paste prompts into ChatGPT.

CRITICAL: Every step must be achievable by pasting a prompt into ChatGPT. NEVER suggest coding, scripting, deploying, using APIs, databases, terminals, or any technical tool. NEVER use technical jargon. The user reads ChatGPT's answer and that's it. Always set "tool" to "chatgpt". Prompts must be fully ready to paste — no blanks or placeholders.

Respond in this exact JSON format (no markdown, no code fences):
{
  "title": "<plan title, 5-8 words>",
  "summary": "<1-2 sentence summary of what they'll accomplish>",
  "tool": "chatgpt",
  "steps": [{ "order": 1, "title": "<friendly step name>", "description": "<1 sentence: what they get>", "prompt": "<80-200 word ready-to-paste prompt, no placeholders>" }]
}

4-6 steps. Each step MUST have a prompt.`;

		this.logger.debug(
			`Generating strategy for goal: ${goal.substring(0, 80)}...`,
		);

		const response = await this.getOpenAI().chat.completions.create({
			model: STRATEGY_MODEL,
			messages: [
				{ role: "system", content: systemMessage },
				{
					role: "user",
					content: `Project Goal:\n${goal}\n\nSpecification Answers:\n${specificationsText}${feedbackBlock}`,
				},
			],
			max_completion_tokens: 16000,
		});

		const content = response.choices[0]?.message?.content?.trim();
		if (!content) throw new Error("Empty response from OpenAI");

		this.logger.debug(`Strategy response: ${content.substring(0, 200)}`);

		const cleaned = content
			.replace(/^```(?:json)?\s*/, "")
			.replace(/\s*```$/, "");
		const strategy = JSON.parse(cleaned) as PlannerStrategy;

		if (!strategy.title || !strategy.steps || !strategy.tool || !strategy.steps[0]?.prompt) {
			throw new Error("Invalid strategy format returned from OpenAI");
		}

		return strategy;
	}
}
