import { Test, type TestingModule } from "@nestjs/testing";
import type { NextFunction, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsersRepository } from "../../users/users.repository";
import {
	type RequestWithTenant,
	TenantContextMiddleware,
} from "./tenant-context.middleware";

describe("TenantContextMiddleware", () => {
	let middleware: TenantContextMiddleware;
	let usersRepo: Record<string, ReturnType<typeof vi.fn>>;
	let mockNext: NextFunction;
	let mockRes: Response;

	beforeEach(async () => {
		usersRepo = {
			getByEmail: vi.fn().mockResolvedValue(undefined),
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				TenantContextMiddleware,
				{ provide: UsersRepository, useValue: usersRepo },
			],
		}).compile();

		middleware = module.get<TenantContextMiddleware>(TenantContextMiddleware);
		mockNext = vi.fn();
		mockRes = {} as Response;
	});

	it("should attach tenantId, orgRole, globalRole from DB user", async () => {
		const req = {
			user: { userId: "u1", email: "alice@mito.hu" },
		} as unknown as RequestWithTenant;

		usersRepo.getByEmail.mockResolvedValue({
			id: "u1",
			email: "alice@mito.hu",
			tenantId: "t1",
			orgRole: "admin",
			globalRole: "user",
		});

		await middleware.use(req, mockRes, mockNext);

		expect(req.tenantId).toBe("t1");
		expect(req.orgRole).toBe("admin");
		expect(req.globalRole).toBe("user");
		expect(mockNext).toHaveBeenCalledOnce();
	});

	it("should call next without attaching tenant context when no user", async () => {
		const req = {} as RequestWithTenant;
		await middleware.use(req, mockRes, mockNext);

		expect(req.tenantId).toBeUndefined();
		expect(req.orgRole).toBeUndefined();
		expect(req.globalRole).toBeUndefined();
		expect(mockNext).toHaveBeenCalledOnce();
	});

	it("should call next when user has no email", async () => {
		const req = {
			user: { userId: "u1" },
		} as unknown as RequestWithTenant;

		await middleware.use(req, mockRes, mockNext);
		expect(req.tenantId).toBeUndefined();
		expect(mockNext).toHaveBeenCalledOnce();
	});

	it("should call next when DB user not found", async () => {
		const req = {
			user: { userId: "u1", email: "unknown@mito.hu" },
		} as unknown as RequestWithTenant;

		await middleware.use(req, mockRes, mockNext);
		expect(req.tenantId).toBeUndefined();
		expect(mockNext).toHaveBeenCalledOnce();
	});

	it("should handle repository errors gracefully", async () => {
		const req = {
			user: { userId: "u1", email: "alice@mito.hu" },
		} as unknown as RequestWithTenant;

		usersRepo.getByEmail.mockRejectedValue(new Error("DB connection failed"));

		await middleware.use(req, mockRes, mockNext);
		expect(req.tenantId).toBeUndefined();
		expect(mockNext).toHaveBeenCalledOnce();
	});

	it("should attach superadmin global role from DB", async () => {
		const req = {
			user: { userId: "u1", email: "admin@mito.hu" },
		} as unknown as RequestWithTenant;

		usersRepo.getByEmail.mockResolvedValue({
			id: "u1",
			email: "admin@mito.hu",
			tenantId: "t1",
			orgRole: "owner",
			globalRole: "superadmin",
		});

		await middleware.use(req, mockRes, mockNext);
		expect(req.globalRole).toBe("superadmin");
		expect(mockNext).toHaveBeenCalledOnce();
	});
});
