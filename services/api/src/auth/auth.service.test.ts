import { describe, expect, it, vi } from "vitest";
import type { AppConfigService } from "../config/config.service";
import type { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
	const mockConfigService = {
		config: {
			GOOGLE_CLIENT_ID: "test-client-id",
			GOOGLE_CLIENT_SECRET: "test-secret",
		},
	} as unknown as AppConfigService;

	const mockUsersService = {
		getByEmail: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
	} as unknown as UsersService;

	const service = new AuthService(mockConfigService, mockUsersService);

	describe("validateUser", () => {
		it("should return userId and email from payload", async () => {
			const result = await service.validateUser({
				sub: "user-123",
				email: "test@example.com",
			});

			expect(result).toEqual({
				userId: "user-123",
				email: "test@example.com",
			});
		});
	});
});
