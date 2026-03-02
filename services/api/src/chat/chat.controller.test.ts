import { Test, type TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

describe("ChatController", () => {
	let controller: ChatController;
	let service: { chat: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		service = {
			chat: vi.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			controllers: [ChatController],
			providers: [{ provide: ChatService, useValue: service }],
		}).compile();

		controller = module.get<ChatController>(ChatController);
	});

	describe("POST /chat", () => {
		it("should return chat response wrapped in data envelope", async () => {
			service.chat.mockResolvedValue({
				answer: "AI helps with productivity.",
				sources: [{ title: "Article 1", url: "https://example.com", relevance: "tools" }],
				tokensUsed: 200,
				model: "gpt-5-mini",
			});

			const result = await controller.chat({
				query: "Tell me about AI",
				history: [],
			});

			expect(result).toEqual({
				data: {
					answer: "AI helps with productivity.",
					sources: [{ title: "Article 1", url: "https://example.com", relevance: "tools" }],
					tokensUsed: 200,
					model: "gpt-5-mini",
				},
			});
			expect(service.chat).toHaveBeenCalledWith("Tell me about AI", []);
		});

		it("should return validation error for empty query", async () => {
			const result = await controller.chat({ query: "" });

			expect(result).toEqual({
				error: { code: "VALIDATION", message: "query is required" },
			});
			expect(service.chat).not.toHaveBeenCalled();
		});

		it("should return validation error for whitespace-only query", async () => {
			const result = await controller.chat({ query: "   " });

			expect(result).toEqual({
				error: { code: "VALIDATION", message: "query is required" },
			});
		});

		it("should trim query before passing to service", async () => {
			service.chat.mockResolvedValue({
				answer: "response",
				sources: [],
				tokensUsed: 50,
				model: "gpt-5-mini",
			});

			await controller.chat({ query: "  hello  " });

			expect(service.chat).toHaveBeenCalledWith("hello", []);
		});

		it("should pass conversation history to service", async () => {
			service.chat.mockResolvedValue({
				answer: "follow-up",
				sources: [],
				tokensUsed: 100,
				model: "gpt-5-mini",
			});

			const history = [
				{ role: "user" as const, content: "hi" },
				{ role: "assistant" as const, content: "hello!" },
			];

			await controller.chat({ query: "thanks", history });

			expect(service.chat).toHaveBeenCalledWith("thanks", history);
		});

		it("should catch service errors and return error envelope", async () => {
			service.chat.mockRejectedValue(new Error("OpenAI rate limit"));

			const result = await controller.chat({ query: "test" });

			expect(result).toEqual({
				error: { code: "CHAT_ERROR", message: "OpenAI rate limit" },
			});
		});

		it("should handle non-Error throws gracefully", async () => {
			service.chat.mockRejectedValue("something broke");

			const result = await controller.chat({ query: "test" });

			expect(result).toEqual({
				error: { code: "CHAT_ERROR", message: "Chat failed" },
			});
		});
	});
});
