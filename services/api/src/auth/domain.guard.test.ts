import { type ExecutionContext, ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfigService } from "../config/config.service";
import { DomainGuard } from "./domain.guard";

describe("DomainGuard", () => {
	function createMockContext(user?: Record<string, unknown>): ExecutionContext {
		return {
			switchToHttp: () => ({
				getRequest: () => ({ user }),
			}),
			getHandler: vi.fn(),
			getClass: vi.fn(),
		} as unknown as ExecutionContext;
	}

	function createGuard(domain: string): DomainGuard {
		const configService = {
			config: { ALLOWED_EMAIL_DOMAIN: domain },
		} as unknown as AppConfigService;
		return new DomainGuard(configService);
	}

	it("should allow access for @mito.hu email", () => {
		const guard = createGuard("mito.hu");
		const context = createMockContext({
			email: "user@mito.hu",
			userId: "u1",
		});
		expect(guard.canActivate(context)).toBe(true);
	});

	it("should deny access for non-mito.hu email", () => {
		const guard = createGuard("mito.hu");
		const context = createMockContext({
			email: "user@gmail.com",
			userId: "u1",
		});
		expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
	});

	it("should deny access when no email on user", () => {
		const guard = createGuard("mito.hu");
		const context = createMockContext({ userId: "u1" });
		expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
	});

	it("should deny access when no user on request", () => {
		const guard = createGuard("mito.hu");
		const context = createMockContext(undefined);
		expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
	});

	it("should allow any email when domain is empty", () => {
		const guard = createGuard("");
		const context = createMockContext({
			email: "anyone@example.com",
			userId: "u1",
		});
		expect(guard.canActivate(context)).toBe(true);
	});
});
