import { Injectable } from "@nestjs/common";
import { z } from "zod";

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	PORT: z.coerce.number().default(3000),
	DYNAMODB_ENDPOINT: z.string().url().optional(),
	AWS_REGION: z.string().default("eu-central-1"),
	REDIS_URL: z.string().default("redis://localhost:6379"),
	COGNITO_USER_POOL_ID: z.string().default(""),
	COGNITO_CLIENT_ID: z.string().default(""),
	COGNITO_CLIENT_SECRET: z.string().default(""),
	COGNITO_DOMAIN: z.string().default(""),
	COGNITO_ISSUER: z.string().default(""),
	APP_URL: z.string().default("http://localhost:5173"),
	API_URL: z.string().default("http://localhost:3000"),
	KB_BUILDER_URL: z.string().default("http://localhost:3002"),
	ALLOWED_EMAIL_DOMAIN: z.string().default("mito.hu"),
});

export type EnvConfig = z.infer<typeof envSchema>;

@Injectable()
export class AppConfigService {
	public readonly config: EnvConfig;

	constructor() {
		this.config = envSchema.parse(process.env);
	}

	get isDevelopment(): boolean {
		return this.config.NODE_ENV === "development";
	}

	get isProduction(): boolean {
		return this.config.NODE_ENV === "production";
	}
}
