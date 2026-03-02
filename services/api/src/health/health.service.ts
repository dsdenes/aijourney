import {
	type DynamoDBDocumentClient,
	ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { DYNAMODB_CLIENT } from "../dynamodb/dynamodb.module";

@Injectable()
export class HealthService {
	private readonly logger = new Logger(HealthService.name);

	constructor(
    @Inject(DYNAMODB_CLIENT) private readonly dynamodb: DynamoDBDocumentClient,
  ) {}

	async check() {
		const checks: Record<string, string> = {};

		// Check DynamoDB
		try {
			await this.dynamodb.send(
				new ScanCommand({ TableName: "users", Limit: 1 }),
			);
			checks["dynamodb"] = "connected";
		} catch (error) {
			this.logger.warn("DynamoDB health check failed", error);
			checks["dynamodb"] = "disconnected";
		}

		const allHealthy = Object.values(checks).every((v) => v === "connected");

		return {
			status: allHealthy ? "ok" : "degraded",
			...checks,
			timestamp: new Date().toISOString(),
		};
	}
}
