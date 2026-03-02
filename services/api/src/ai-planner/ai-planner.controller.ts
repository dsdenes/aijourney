import type { PlannerAnswer, PlannerRound } from "@aijourney/shared";
import { Body, Controller, Inject, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AiPlannerService } from "./ai-planner.service";

@ApiTags("ai-planner")
@Controller("ai-planner")
export class AiPlannerController {
	constructor(
		@Inject(AiPlannerService)
		private readonly service: AiPlannerService,
	) {}

	@Post("questions")
	@ApiOperation({
		summary:
			"Generate 6 specification questions for a given round",
	})
	@ApiBody({
		schema: {
			type: "object",
			properties: {
				goal: { type: "string" },
				round: { type: "number", enum: [1, 2, 3] },
				previousAnswers: {
					type: "array",
					items: {
						type: "object",
						properties: {
							id: { type: "number" },
							question: { type: "string" },
							answer: { type: "boolean" },
						},
					},
				},
			},
			required: ["goal", "round"],
		},
	})
	async generateQuestions(
		@Body()
		body: {
			goal: string;
			round: PlannerRound;
			previousAnswers?: PlannerAnswer[];
		},
	) {
		if (!body.goal?.trim()) {
			return {
				error: {
					code: "VALIDATION",
					message: "goal is required",
				},
			};
		}
		if (![1, 2, 3].includes(body.round)) {
			return {
				error: {
					code: "VALIDATION",
					message: "round must be 1, 2, or 3",
				},
			};
		}

		try {
			const questions = await this.service.generateQuestions(
				body.goal.trim(),
				body.round,
				body.previousAnswers || [],
			);
			return { data: { round: body.round, questions } };
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "Failed to generate questions";
			return { error: { code: "PLANNER_ERROR", message } };
		}
	}

	@Post("strategy")
	@ApiOperation({
		summary:
			"Generate final AI usage strategy from goal + all answers",
	})
	@ApiBody({
		schema: {
			type: "object",
			properties: {
				goal: { type: "string" },
				answers: {
					type: "array",
					items: {
						type: "object",
						properties: {
							id: { type: "number" },
							question: { type: "string" },
							answer: { type: "boolean" },
						},
					},
				},
			},
			required: ["goal", "answers"],
		},
	})
	async generateStrategy(
		@Body() body: { goal: string; answers: PlannerAnswer[]; feedback?: string },
	) {
		if (!body.goal?.trim()) {
			return {
				error: {
					code: "VALIDATION",
					message: "goal is required",
				},
			};
		}
		if (
			!body.answers ||
			!Array.isArray(body.answers) ||
			body.answers.length === 0
		) {
			return {
				error: {
					code: "VALIDATION",
					message: "answers array is required",
				},
			};
		}

		try {
			const strategy = await this.service.generateStrategy(
				body.goal.trim(),
				body.answers,
				body.feedback?.trim(),
			);
			return { data: strategy };
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "Failed to generate strategy";
			return { error: { code: "PLANNER_ERROR", message } };
		}
	}
}
