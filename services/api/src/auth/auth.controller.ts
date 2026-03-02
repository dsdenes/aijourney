import {
	Body,
	Controller,
	Get,
	Inject,
	Post,
	Req,
	UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthService } from "./auth.service";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
	constructor(
		@Inject(AuthService) private readonly authService: AuthService,
	) {}

	@Post("token")
	@ApiOperation({
		summary: "Exchange authorization code for tokens",
	})
	@ApiBody({
		schema: {
			type: "object",
			properties: {
				code: { type: "string" },
				redirectUri: { type: "string" },
			},
			required: ["code", "redirectUri"],
		},
	})
	async exchangeToken(
		@Body() body: { code: string; redirectUri: string },
	) {
		const tokens = await this.authService.exchangeCodeForTokens(
			body.code,
			body.redirectUri,
		);
		return { data: tokens };
	}

	@Get("me")
	@UseGuards(AuthGuard("jwt"))
	@ApiBearerAuth()
	@ApiOperation({ summary: "Get current user profile" })
	async me(@CurrentUser() user: { userId: string; email: string }) {
		return { data: user };
	}

	@Post("logout")
	@UseGuards(AuthGuard("jwt"))
	@ApiBearerAuth()
	@ApiOperation({ summary: "Logout (clear session)" })
	async logout() {
		return { data: { message: "Logged out" } };
	}
}
