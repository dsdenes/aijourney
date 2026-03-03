import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Db } from "mongodb";
import { MONGODB_DB } from "../mongodb/mongodb.module";

@Injectable()
export class HealthService {
	private readonly logger = new Logger(HealthService.name);

	constructor(@Inject(MONGODB_DB) private readonly db: Db) {}

	async check() {
		const checks: Record<string, string> = {};

		// Check MongoDB
		try {
			await this.db.command({ ping: 1 });
			checks["mongodb"] = "connected";
		} catch (error) {
			this.logger.warn("MongoDB health check failed", error);
			checks["mongodb"] = "disconnected";
		}

		const allHealthy = Object.values(checks).every((v) => v === "connected");

		return {
			status: allHealthy ? "ok" : "degraded",
			...checks,
			timestamp: new Date().toISOString(),
		};
	}
}
