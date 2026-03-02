import { Test, type TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DYNAMODB_CLIENT } from "../dynamodb/dynamodb.module";
import { HealthService } from "./health.service";

describe("HealthService", () => {
	let service: HealthService;
	let mockDynamodb: { send: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		mockDynamodb = { send: vi.fn() };

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				HealthService,
				{
					provide: DYNAMODB_CLIENT,
					useValue: mockDynamodb,
				},
			],
		}).compile();

		service = module.get<HealthService>(HealthService);
	});

	it("should return ok when dynamodb is connected", async () => {
		mockDynamodb.send.mockResolvedValue({ Items: [] });

		const result = await service.check();

		expect(result.status).toBe("ok");
		expect(result.dynamodb).toBe("connected");
		expect(result.timestamp).toBeDefined();
	});

	it("should return degraded when dynamodb is disconnected", async () => {
		mockDynamodb.send.mockRejectedValue(new Error("Connection refused"));

		const result = await service.check();

		expect(result.status).toBe("degraded");
		expect(result.dynamodb).toBe("disconnected");
	});
});
