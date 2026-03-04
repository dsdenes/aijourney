import type {
	PlannerAnswer,
	PlannerQuestion,
	PlannerRound,
	PlannerStrategy,
} from "@aijourney/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { AppConfigService } from "../config/config.service";

const QUESTIONS_MODEL = "grok-4-1-fast-reasoning";
const STRATEGY_MODEL = "grok-4-1-fast-reasoning";
const LAST_STEP_MODEL = "gpt-5.2"; // OpenAI model for the final step (high reasoning)

@Injectable()
export class AiPlannerService {
	private readonly logger = new Logger(AiPlannerService.name);
	private openai: OpenAI | null = null;

	constructor(
		@Inject(AppConfigService)
		private readonly configService: AppConfigService,
	) {}

	private getClient(): OpenAI {
		if (!this.openai) {
			const apiKey = process.env.GROK_API_KEY;
			if (!apiKey) {
				throw new Error("GROK_API_KEY environment variable is not set");
			}
			this.openai = new OpenAI({
				apiKey,
				baseURL: "https://api.x.ai/v1",
			});
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

		const response = await this.getClient().chat.completions.create({
			model: QUESTIONS_MODEL,
			messages: [
				{ role: "system", content: systemMessage },
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
	 * Generate the final AI usage strategy.
	 * Steps 1..N-1 are planned by Grok, the last step is regenerated by gpt-5.2 with high reasoning.
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

CRITICAL RULES:
- Every step must be achievable by pasting a prompt into ChatGPT
- NEVER suggest coding, scripting, deploying, using APIs, databases, terminals, or any technical tool
- NEVER use technical jargon. The user reads ChatGPT's answer and that's it
- Always set "tool" to "chatgpt"
- Prompts must be fully ready to paste — no blanks or placeholders

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
    "prompt": "<80-200 word ready-to-paste prompt, no placeholders>"
  }]
}`;

		this.logger.debug(
			`Generating strategy for goal: ${goal.substring(0, 80)}...`,
		);

		const response = await this.getClient().chat.completions.create({
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
		if (!content) throw new Error("Empty response from Grok");

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
			throw new Error("Invalid strategy format returned from Grok");
		}

		// Regenerate the LAST step using gpt-5.2 with high reasoning
		if (strategy.steps.length > 0) {
			try {
				const enhancedLastStep = await this.regenerateLastStep(
					goal,
					strategy,
				);
				strategy.steps[strategy.steps.length - 1] = enhancedLastStep;
			} catch (err) {
				this.logger.warn(
					`Failed to enhance last step with gpt-5.2, keeping Grok version: ${(err as Error).message}`,
				);
				// Keep the Grok-generated last step as fallback
			}
		}

		return strategy;
	}

	/**
	 * Regenerate only the last step of a strategy using gpt-5.2 (high reasoning).
	 */
	private async regenerateLastStep(
		goal: string,
		strategy: PlannerStrategy,
	): Promise<PlannerStrategy["steps"][number]> {
		const openaiApiKey = process.env.OPENAI_API_KEY;
		if (!openaiApiKey) {
			throw new Error("OPENAI_API_KEY not set — cannot use gpt-5.2");
		}

		const openaiClient = new OpenAI({ apiKey: openaiApiKey });

		const lastStep = strategy.steps[strategy.steps.length - 1]!;
		const previousStepsSummary = strategy.steps
			.slice(0, -1)
			.map(
				(s) =>
					`Step ${s.order}: "${s.title}" → Output: ${s.outputArtifacts}`,
			)
			.join("\n");

		const systemMessage = `You are an expert AI prompt engineer creating the FINAL step of a multi-step ChatGPT plan for a NON-TECHNICAL user.

The user's goal: "${goal}"
Plan title: "${strategy.title}"

Previous steps completed:
${previousStepsSummary || "(This is a single-step plan)"}

The user will have these artifacts from previous steps: ${lastStep.inputArtifacts}

Your task: Rewrite and improve the last step (Step ${lastStep.order}: "${lastStep.title}") to be the best possible concluding step.

Rules:
- The prompt must be 100-250 words, fully ready to paste into ChatGPT, no blanks or placeholders
- It must reference what the user obtained from previous steps
- It must produce a clear, actionable final deliverable
- "outputArtifacts" should describe the final output AND what to do with it
- Keep language simple — no technical jargon

Respond in this exact JSON format (no markdown, no code fences):
{
  "order": ${lastStep.order},
  "title": "<friendly step name>",
  "description": "<1 sentence: what they get>",
  "inputArtifacts": "<what you have before this step>",
  "outputArtifacts": "<what you'll receive + what to do with it>",
  "prompt": "<100-250 word ready-to-paste prompt>"
}`;

		this.logger.debug("Regenerating last step with gpt-5.2...");

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const requestBody: any = {
			model: LAST_STEP_MODEL,
			messages: [
				{ role: "system", content: systemMessage },
				{
					role: "user",
					content: `Please create the best possible final step for this plan.`,
				},
			],
			max_completion_tokens: 16000,
			// gpt-5.2 supports reasoning effort (not yet in SDK types)
			reasoning: { effort: "high" },
		};
		const response = await openaiClient.chat.completions.create(requestBody);

		const lastContent = response.choices[0]?.message?.content?.trim();
		if (!lastContent) throw new Error("Empty response from gpt-5.2");

		this.logger.debug(
			`Last step gpt-5.2 response: ${lastContent.substring(0, 200)}`,
		);

		const cleanedLast = lastContent
			.replace(/^```(?:json)?\s*/, "")
			.replace(/\s*```$/, "");
		return JSON.parse(cleanedLast) as PlannerStrategy["steps"][number];
	}
}
