import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const booleanishSchema = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }
  return false;
}, z.boolean());

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    APP_VERSION: z.string().default('0.1.0'),
    PORT: z.coerce.number().default(3000),
    MONGODB_URI: z.string().default('mongodb://localhost:27017'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
    OPENAI_API_KEY: z.string().default(''),
    APP_URL: z.string().default('http://localhost:5173'),
    API_URL: z.string().default('http://localhost:3000'),
    KB_BUILDER_URL: z.string().default('http://localhost:3002'),
    STRIPE_SECRET_KEY: z.string().default(''),
    STRIPE_WEBHOOK_SECRET: z.string().default(''),
    STRIPE_PRO_PRICE_ID: z.string().default(''),
    STRIPE_ENTERPRISE_PRICE_ID: z.string().default(''),
    STRIPE_LLM_PACK_PRICE_ID: z.string().default(''),
    SMTP_HOST: z.string().default('smtp.tem.scaleway.com'),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_SECURE: booleanishSchema.default(false),
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
    SMTP_FROM_EMAIL: z.string().default(''),
    SMTP_FROM_NAME: z.string().default('AI Journey'),
    SCW_ACCESS_KEY: z.string().default(''),
    SCW_SECRET_KEY: z.string().default(''),
    SCW_REGION: z.string().default('fr-par'),
    SCW_ENDPOINT: z.string().default(''),
    SCW_BUCKET_NAME: z.string().default('aijourney-company-docs'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') {
      return;
    }

    const requiredKeys = [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'OPENAI_API_KEY',
      'APP_URL',
      'API_URL',
      'KB_BUILDER_URL',
    ] as const;

    for (const key of requiredKeys) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} must be set in production`,
          path: [key],
        });
      }
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

@Injectable()
export class AppConfigService {
  public readonly config: EnvConfig;

  constructor() {
    this.config = envSchema.parse(process.env);
  }

  get isDevelopment(): boolean {
    return this.config.NODE_ENV === 'development';
  }

  get isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }

  get version(): string {
    return this.config.APP_VERSION;
  }
}
