import { Body, Controller, Inject, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PromptOptimizerService } from "./prompt-optimizer.service";

@ApiTags("prompt-optimizer")
@Controller("prompt-optimizer")
export class PromptOptimizerController {
	constructor(
		@Inject(PromptOptimizerService)
		private readonly service: PromptOptimizerService,
	) {}

	@Post("analyze")
	@ApiOperation({ summary: "Analyze prompt quality and suggest goals" })
	@ApiBody({
		schema: {
			type: "object",
			properties: { prompt: { type: "string" } },
			required: ["prompt"],
		},
	})
	async analyze(@Body() body: { prompt: string }) {
		const result = await this.service.analyzePrompt(body.prompt);
		return { data: result };
	}

	@Post("optimize")
	@ApiOperation({ summary: "Optimize a prompt for a chosen goal" })
	@ApiBody({
		schema: {
			type: "object",
			properties: {
				prompt: { type: "string" },
				goal: { type: "string" },
			},
			required: ["prompt", "goal"],
		},
	})
	async optimize(@Body() body: { prompt: string; goal: string }) {
		const result = await this.service.optimizePrompt(body.prompt, body.goal);
		return { data: result };
	}
}
