import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const booleanishSchema = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }
  return false;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
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
}
