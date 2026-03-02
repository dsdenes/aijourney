import { Body, Controller, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ChatService, type ChatMessage } from "./chat.service";

class ChatQueryDto {
	query!: string;
	history?: ChatMessage[];
}

@ApiTags("chat")
@Controller("chat")
export class ChatController {
	constructor(private readonly chatService: ChatService) {}

	@Post()
	@ApiOperation({ summary: "Send a KB chat query" })
	async chat(@Body() body: ChatQueryDto) {
		if (!body.query?.trim()) {
			return {
				error: { code: "VALIDATION", message: "query is required" },
			};
		}

		try {
			const result = await this.chatService.chat(
				body.query.trim(),
				body.history || [],
			);
			// Strip full I/O from client response (stored in agent run only)
			const { fullInput: _fi, fullOutput: _fo, ...clientResult } = result;
			return { data: clientResult };
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Chat failed";
			return {
				error: { code: "CHAT_ERROR", message },
			};
		}
	}
}
