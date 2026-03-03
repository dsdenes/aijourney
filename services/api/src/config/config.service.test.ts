import { describe, expect, it } from "vitest";
import { AppConfigService } from "./config.service";

describe("AppConfigService", () => {
	it("should parse default environment variables", () => {
		// Save original env
		const originalEnv = { ...process.env };

		// Set minimal env
		process.env.NODE_ENV = "test";
		process.env.REDIS_URL = "redis://localhost:6379";

		const configService = new AppConfigService();

		expect(configService.config.NODE_ENV).toBe("test");
		expect(configService.config.PORT).toBe(3000);
		expect(configService.config.REDIS_URL).toBe("redis://localhost:6379");
		expect(configService.config.ALLOWED_EMAIL_DOMAIN).toBe("mito.hu");

		// Restore env
		process.env = originalEnv;
	});

	it("should return isDevelopment correctly", () => {
		const originalEnv = { ...process.env };
		process.env.NODE_ENV = "development";

		const configService = new AppConfigService();
		expect(configService.isDevelopment).toBe(true);
		expect(configService.isProduction).toBe(false);

		process.env = originalEnv;
	});

	it("should return isProduction correctly", () => {
		const originalEnv = { ...process.env };
		process.env.NODE_ENV = "production";

		const configService = new AppConfigService();
		expect(configService.isDevelopment).toBe(false);
		expect(configService.isProduction).toBe(true);

		process.env = originalEnv;
	});

	it("should coerce PORT to number", () => {
		const originalEnv = { ...process.env };
		process.env.PORT = "4000";

		const configService = new AppConfigService();
		expect(configService.config.PORT).toBe(4000);

		process.env = originalEnv;
	});

	it("should accept MONGODB_URI with default", () => {
		const originalEnv = { ...process.env };
		process.env.MONGODB_URI = "mongodb://myhost:27017";

		const configService = new AppConfigService();
		expect(configService.config.MONGODB_URI).toBe("mongodb://myhost:27017");

		process.env = originalEnv;
	});
});
