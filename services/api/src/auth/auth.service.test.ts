import { describe, expect, it } from "vitest";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
	const service = new AuthService();

	describe("validateUser", () => {
		it("should return userId and email from payload", async () => {
			const result = await service.validateUser({
				sub: "user-123",
				email: "test@mito.hu",
			});

			expect(result).toEqual({
				userId: "user-123",
				email: "test@mito.hu",
			});
		});
	});
});
