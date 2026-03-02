import { type ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RolesGuard } from "./roles.guard";

describe("RolesGuard", () => {
	let guard: RolesGuard;
	let reflector: Reflector;

	function createMockContext(user?: Record<string, unknown>): ExecutionContext {
		return {
			getHandler: vi.fn(),
			getClass: vi.fn(),
			switchToHttp: () => ({
				getRequest: () => ({ user }),
				getResponse: vi.fn(),
				getNext: vi.fn(),
			}),
			getArgs: vi.fn(),
			getArgByIndex: vi.fn(),
			switchToRpc: vi.fn(),
			switchToWs: vi.fn(),
			getType: vi.fn(),
		} as unknown as ExecutionContext;
	}

	beforeEach(() => {
		reflector = new Reflector();
		guard = new RolesGuard(reflector);
	});

	it("should allow access when no roles are required", () => {
		vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
		const context = createMockContext({ userId: "u1", role: "employee" });
		expect(guard.canActivate(context)).toBe(true);
	});

	it("should allow access when empty roles array", () => {
		vi.spyOn(reflector, "getAllAndOverride").mockReturnValue([]);
		const context = createMockContext({ userId: "u1", role: "employee" });
		expect(guard.canActivate(context)).toBe(true);
	});

	it("should allow access when user has required role", () => {
		vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(["admin"]);
		const context = createMockContext({
			userId: "u1",
			role: "admin",
		});
		expect(guard.canActivate(context)).toBe(true);
	});

	it("should deny access when user lacks required role", () => {
		vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(["admin"]);
		const context = createMockContext({
			userId: "u1",
			role: "employee",
		});
		expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
	});

	it("should deny access when no user on request", () => {
		vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(["admin"]);
		const context = createMockContext(undefined);
		expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
	});

	it("should allow if user role matches any of multiple required roles", () => {
		vi.spyOn(reflector, "getAllAndOverride").mockReturnValue([
			"admin",
			"employee",
		]);
		const context = createMockContext({
			userId: "u1",
			role: "employee",
		});
		expect(guard.canActivate(context)).toBe(true);
	});
});
