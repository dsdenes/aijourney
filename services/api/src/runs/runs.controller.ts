import { createRunRequestSchema } from "@aijourney/shared";
import {
	Body,
	Controller,
	Get,
	Inject,
	Param,
	Post,
	UseGuards,
	UsePipes,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RolesGuard } from "../auth/roles.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { RunsService } from "./runs.service";

@ApiTags("runs")
@Controller("runs")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"))
export class RunsController {
	constructor(@Inject(RunsService) private readonly runsService: RunsService) {}

	@Post()
	@UsePipes(new ZodValidationPipe(createRunRequestSchema))
	@ApiOperation({ summary: "Create a new run request" })
	async create(@CurrentUser() user: { userId: string }, @Body() body: unknown) {
		const run = await this.runsService.create(user.userId, body as any);
		return { data: run };
	}

	@Get()
  @ApiOperation({ summary: 'List current user runs' })
  async list(@CurrentUser() user: { userId: string }) {
    const runs = await this.runsService.listByUser(user.userId);
    return { data: runs };
  }

	@Get("all")
	@UseGuards(RolesGuard)
	@Roles("admin")
	@ApiOperation({ summary: "List ALL run requests (admin)" })
	async listAll() {
		const runs = await this.runsService.listAll();
		return { data: runs };
	}

	@Get(':id')
  @ApiOperation({ summary: 'Get run request by ID' })
  async getOne(@Param('id') id: string) {
    const run = await this.runsService.getById(id);
    return { data: run };
  }

	@Post(":id/approve")
	@UseGuards(RolesGuard)
	@Roles("admin")
	@ApiOperation({ summary: "Approve a run request (admin)" })
	async approve(
		@Param('id') id: string,
		@CurrentUser() user: { userId: string },
	) {
		const run = await this.runsService.approve(id, user.userId);
		return { data: run };
	}

	@Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Reject a run request (admin)' })
  async reject(@Param('id') id: string) {
    const run = await this.runsService.reject(id);
    return { data: run };
  }

	@Post(":id/cancel")
	@ApiOperation({ summary: "Cancel a run request" })
	async cancel(
		@Param('id') id: string,
		@CurrentUser() user: { userId: string },
	) {
		const run = await this.runsService.cancel(id, user.userId);
		return { data: run };
	}
}
