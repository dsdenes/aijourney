import { createJourneySchema, updateJourneySchema } from "@aijourney/shared";
import {
	Body,
	Controller,
	Get,
	Inject,
	Param,
	Patch,
	Post,
	UseGuards,
	UsePipes,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { JourneysService } from "./journeys.service";

@ApiTags("journeys")
@Controller("journeys")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"))
export class JourneysController {
	constructor(@Inject(JourneysService) private readonly journeysService: JourneysService) {}

	@Get()
  @ApiOperation({ summary: 'List current user journeys' })
  async list(@CurrentUser() user: { userId: string }) {
    const journeys = await this.journeysService.listByUser(user.userId);
    return { data: journeys };
  }

	@Get(':id')
  @ApiOperation({ summary: 'Get journey by ID' })
  async getOne(@Param('id') id: string) {
    const journey = await this.journeysService.getById(id);
    return { data: journey };
  }

	@Post()
  @UsePipes(new ZodValidationPipe(createJourneySchema))
  @ApiOperation({ summary: 'Create a new journey' })
  async create(@Body() body: unknown) {
    const journey = await this.journeysService.create(body as Record<string, unknown> as any);
    return { data: journey };
  }

	@Patch(":id")
	@UsePipes(new ZodValidationPipe(updateJourneySchema))
	@ApiOperation({ summary: "Update journey" })
	async update(@Param('id') id: string, @Body() body: unknown) {
		const journey = await this.journeysService.update(
			id,
			body as Record<string, unknown> as any,
		);
		return { data: journey };
	}
}
