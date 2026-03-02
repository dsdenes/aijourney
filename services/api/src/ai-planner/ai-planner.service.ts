import type {
	PlannerAnswer,
	PlannerQuestion,
	PlannerRound,
	PlannerStrategy,
} from "@aijourney/shared";
import {
	BedrockRuntimeClient,
	InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { Inject, Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { AppConfigService } from "../config/config.service";

const QUESTIONS_MODEL = "gpt-5-mini";
const STRATEGY_MODEL_ID = "anthropic.claude-sonnet-4-6-20250514-v1:0";
const AWS_REGION = "eu-central-1";

@Injectable()
export class AiPlannerService {
	private readonly logger = new Logger(AiPlannerService.name);
	private openai: OpenAI | null = null;
	private bedrock: BedrockRuntimeClient | null = null;

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

	private getBedrock(): BedrockRuntimeClient {
		if (!this.bedrock) {
			this.bedrock = new BedrockRuntimeClient({ region: AWS_REGION });
		}
		return this.bedrock;
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
						.map((a) => `- "${a.question}" → ${a.answer ? "YES" : "NO"}`)
						.join(
							"\n",
						)}\n\nDo NOT repeat any of the above questions. Build on what you already know from the answers to ask deeper, more specific questions.`
				: "";

		const roundLabels: Record<PlannerRound, string> = {
			1: "broad exploration — understand the general scope, domain, team size, timeline, and main objectives",
			2: "narrowing down — given what you know, ask about specific constraints, preferred AI capabilities, data sensitivity, existing tools, and success criteria",
			3: "final details — ask about edge cases, output format preferences, integration needs, quality requirements, and deployment considerations",
		};

		const systemMessage = `You are an AI project planning consultant. The user wants to use AI for a complex project. Your job is to ask exactly 6 true/false questions to better understand their needs.

This is specification round ${round} of 3. Focus on: ${roundLabels[round]}.${previousContext}

Rules:
- Generate EXACTLY 6 questions
- Each question MUST be answerable with true/false (yes/no)
- Questions should be specific and actionable, not vague
- Each question should reveal meaningful information about the project
- Questions should cover different aspects of the project
- Do NOT repeat any previously asked questions

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
	 * Generate the final AI usage strategy using Claude Sonnet 4.6 via Bedrock.
	 */
	async generateStrategy(
		goal: string,
		allAnswers: PlannerAnswer[],
	): Promise<PlannerStrategy> {
		const specificationsText = allAnswers
			.map((a) => `- "${a.question}" → ${a.answer ? "YES" : "NO"}`)
			.join("\n");

		const prompt = `You are an expert AI strategy consultant. A user wants to use AI for a project and has answered specification questions to clarify their needs.

Project Goal:
${goal}

Specification Answers:
${specificationsText}

Based on this information, create a comprehensive AI usage strategy. The strategy should be practical and actionable, defaulting to ChatGPT as the primary tool unless the requirements clearly call for something else.

Respond in this exact JSON format (no markdown, no code fences):
{
  "title": "<concise strategy title, 5-10 words>",
  "summary": "<2-3 sentence executive summary of the strategy>",
  "steps": [
    {
      "order": 1,
      "title": "<step title>",
      "description": "<detailed description of what to do in this step, 2-4 sentences>",
      "aiRole": "<how AI helps in this step, 1-2 sentences>"
    }
  ],
  "examplePrompt": "<a ready-to-use example prompt the user can copy-paste into ChatGPT to get started with the first step. Make it detailed, specific to their project, and follow prompting best practices (clear context, role, constraints, format).>",
  "recommendedTools": [
    {
      "name": "<tool name>",
      "description": "<why this tool is relevant, 1 sentence>",
      "url": "<optional URL>"
    }
  ],
  "tips": [
    "<practical tip 1>",
    "<practical tip 2>",
    "<practical tip 3>"
  ]
}

Provide 4-6 steps, 2-4 recommended tools (always include ChatGPT as the first), and 3-5 tips. The example prompt should be substantial (at least 100 words) and ready to use.`;

		this.logger.debug(
			`Generating strategy for goal: ${goal.substring(0, 80)}...`,
		);

		try {
			const bedrock = this.getBedrock();
			const body = JSON.stringify({
				anthropic_version: "bedrock-2023-05-31",
				max_tokens: 4096,
				temperature: 0.5,
				messages: [{ role: "user", content: prompt }],
			});

			const command = new InvokeModelCommand({
				modelId: STRATEGY_MODEL_ID,
				contentType: "application/json",
				accept: "application/json",
				body: new TextEncoder().encode(body),
			});

			const response = await bedrock.send(command);
			const responseBody = JSON.parse(
				new TextDecoder().decode(response.body),
			) as { content: { type: string; text: string }[] };

			const text = responseBody.content?.[0]?.text?.trim();
			if (!text) throw new Error("Empty response from Bedrock Claude");

			this.logger.debug(`Strategy response: ${text.substring(0, 200)}`);

			const cleaned = text
				.replace(/^```(?:json)?\s*/, "")
				.replace(/\s*```$/, "");
			const strategy = JSON.parse(cleaned) as PlannerStrategy;

			// Validate structure
			if (!strategy.title || !strategy.steps || !strategy.examplePrompt) {
				throw new Error("Invalid strategy structure from LLM");
			}

			return strategy;
		} catch (err) {
			this.logger.error(
				`Bedrock strategy generation failed: ${(err as Error).message}`,
			);
			// Fall back to OpenAI if Bedrock fails
			return this.generateStrategyFallback(goal, allAnswers);
		}
	}

	/**
	 * Fallback: generate strategy via OpenAI if Bedrock is unavailable.
	 */
	private async generateStrategyFallback(
		goal: string,
		allAnswers: PlannerAnswer[],
	): Promise<PlannerStrategy> {
		this.logger.warn("Falling back to OpenAI for strategy generation");

		const specificationsText = allAnswers
			.map((a) => `- "${a.question}" → ${a.answer ? "YES" : "NO"}`)
			.join("\n");

		const systemMessage = `You are an expert AI strategy consultant. Create a practical AI usage strategy based on the user's project goal and specification answers. Default to ChatGPT as the primary tool.

Respond in this exact JSON format (no markdown, no code fences):
{
  "title": "<concise strategy title>",
  "summary": "<2-3 sentence summary>",
  "steps": [{ "order": 1, "title": "<title>", "description": "<2-4 sentences>", "aiRole": "<how AI helps>" }],
  "examplePrompt": "<detailed ready-to-use prompt, 100+ words>",
  "recommendedTools": [{ "name": "<name>", "description": "<why>", "url": "<url>" }],
  "tips": ["<tip1>", "<tip2>", "<tip3>"]
}

4-6 steps, 2-4 tools (ChatGPT first), 3-5 tips.`;

		const response = await this.getOpenAI().chat.completions.create({
			model: "gpt-5-mini",
			messages: [
				{ role: "system", content: systemMessage },
				{
					role: "user",
					content: `Project Goal:\n${goal}\n\nSpecification Answers:\n${specificationsText}`,
				},
			],
			max_completion_tokens: 16000,
		});

		const content = response.choices[0]?.message?.content?.trim();
		if (!content) throw new Error("Empty response from OpenAI fallback");

		const cleaned = content
			.replace(/^```(?:json)?\s*/, "")
			.replace(/\s*```$/, "");
		return JSON.parse(cleaned) as PlannerStrategy;
	}
}
