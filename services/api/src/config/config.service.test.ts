import { describe, expect, it } from 'vitest';
import { AppConfigService } from './config.service';

function createBaseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'test',
    REDIS_URL: 'redis://localhost:6379',
    ...overrides,
  };
}

describe('AppConfigService', () => {
  it('should parse default environment variables', () => {
    const originalEnv = { ...process.env };
    process.env = createBaseEnv();

    const configService = new AppConfigService();

    expect(configService.config.NODE_ENV).toBe('test');
    expect(configService.config.PORT).toBe(3000);
    expect(configService.config.REDIS_URL).toBe('redis://localhost:6379');

    process.env = originalEnv;
  });

  it('should return isDevelopment correctly', () => {
    const originalEnv = { ...process.env };
    process.env = createBaseEnv({ NODE_ENV: 'development' });

    const configService = new AppConfigService();
    expect(configService.isDevelopment).toBe(true);
    expect(configService.isProduction).toBe(false);

    process.env = originalEnv;
  });

  it('should return isProduction correctly', () => {
    const originalEnv = { ...process.env };
    process.env = createBaseEnv({
      NODE_ENV: 'production',
      APP_URL: 'https://app.example.com',
      API_URL: 'https://api.example.com',
      KB_BUILDER_URL: 'https://kb.example.com',
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
      OPENAI_API_KEY: 'test-openai-key',
    });

    const configService = new AppConfigService();
    expect(configService.isDevelopment).toBe(false);
    expect(configService.isProduction).toBe(true);

    process.env = originalEnv;
  });

  it('should coerce PORT to number', () => {
    const originalEnv = { ...process.env };
    process.env = createBaseEnv({ PORT: '4000' });

    const configService = new AppConfigService();
    expect(configService.config.PORT).toBe(4000);

    process.env = originalEnv;
  });

  it('should accept MONGODB_URI with default', () => {
    const originalEnv = { ...process.env };
    process.env = createBaseEnv({ MONGODB_URI: 'mongodb://myhost:27017' });

    const configService = new AppConfigService();
    expect(configService.config.MONGODB_URI).toBe('mongodb://myhost:27017');

    process.env = originalEnv;
  });

  it('should require auth and llm config in production', () => {
    const originalEnv = { ...process.env };
    process.env = createBaseEnv({
      NODE_ENV: 'production',
      APP_URL: 'https://app.example.com',
      API_URL: 'https://api.example.com',
      KB_BUILDER_URL: 'https://kb.example.com',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      OPENAI_API_KEY: '',
    });

    expect(() => new AppConfigService()).toThrow(/must be set in production/);

    process.env = originalEnv;
  });

  it('should expose version metadata', () => {
    const originalEnv = { ...process.env };
    process.env = createBaseEnv({ APP_VERSION: '1.2.3' });

    const configService = new AppConfigService();
    expect(configService.version).toBe('1.2.3');

    process.env = originalEnv;
  });
});
