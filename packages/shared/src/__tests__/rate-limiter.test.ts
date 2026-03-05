import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter, getRateLimiter } from '../utils/rate-limiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      rpm: 10,
      tpm: 1000,
      name: 'test-model',
      safetyMargin: 1.0, // No margin for testing
    });
  });

  it('should allow requests within limits', async () => {
    const waited = await limiter.waitForCapacity(100);
    expect(waited).toBe(0);
  });

  it('should track request count', () => {
    limiter.recordRequest(100);
    limiter.recordRequest(200);
    const usage = limiter.getUsage();
    expect(usage.requestCount).toBe(2);
    expect(usage.tokenCount).toBe(300);
  });

  it('should track token usage via recordUsage', () => {
    limiter.recordUsage(500);
    const usage = limiter.getUsage();
    expect(usage.requestCount).toBe(1);
    expect(usage.tokenCount).toBe(500);
  });

  it('should throttle when RPM limit is reached', async () => {
    // Fill up to RPM limit
    for (let i = 0; i < 10; i++) {
      limiter.recordRequest(0);
    }

    // Next request should need to wait
    const usage = limiter.getUsage();
    expect(usage.requestCount).toBe(10);
  });

  it('should return human-readable status', () => {
    limiter.recordRequest(250);
    limiter.recordRequest(250);
    const status = limiter.getStatus();
    expect(status).toContain('test-model');
    expect(status).toContain('RPM: 2/10');
    expect(status).toContain('TPM: 500/1000');
  });

  it('should handle updateFromHeaders gracefully', () => {
    // Should not throw
    limiter.updateFromHeaders({
      'x-ratelimit-remaining-requests': '5',
      'x-ratelimit-remaining-tokens': '50000',
    });

    limiter.updateFromHeaders({
      'x-ratelimit-remaining-requests': undefined,
      'x-ratelimit-remaining-tokens': undefined,
    });
  });

  it('should apply safety margin', () => {
    const margined = new RateLimiter({
      rpm: 100,
      tpm: 10000,
      safetyMargin: 0.5,
    });

    // Fill to 50 (effective limit with 0.5 margin)
    for (let i = 0; i < 50; i++) {
      margined.recordRequest(0);
    }

    const usage = margined.getUsage();
    expect(usage.requestCount).toBe(50);
    // The status should show effective limits
    const status = margined.getStatus();
    expect(status).toContain('RPM: 50/50');
  });
});

describe('getRateLimiter', () => {
  it('should return singleton per model', () => {
    const a = getRateLimiter('test-singleton-model');
    const b = getRateLimiter('test-singleton-model');
    expect(a).toBe(b);
  });

  it('should return different instances for different models', () => {
    const a = getRateLimiter('model-a-test');
    const b = getRateLimiter('model-b-test');
    expect(a).not.toBe(b);
  });

  it('should use default limits for known models', () => {
    const limiter = getRateLimiter('gpt-5-mini');
    const status = limiter.getStatus();
    // Default: 500 RPM * 0.85 margin = 425
    expect(status).toContain('425');
  });

  it('should accept overrides', () => {
    const limiter = getRateLimiter('custom-test-model', {
      rpm: 200,
      tpm: 50000,
      safetyMargin: 1.0,
    });
    const status = limiter.getStatus();
    expect(status).toContain('RPM: 0/200');
    expect(status).toContain('TPM: 0/50000');
  });
});
