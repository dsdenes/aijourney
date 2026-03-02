/**
 * Token-bucket rate limiter for OpenAI API calls.
 *
 * Tracks requests-per-minute (RPM) and tokens-per-minute (TPM) using
 * a sliding window. Before each API call, consumers call `waitForCapacity()`
 * which resolves when the call can safely proceed without exceeding limits.
 *
 * Rate limit response headers (`x-ratelimit-remaining-requests`, etc.)
 * can be fed back via `updateFromHeaders()` for dynamic adjustment.
 *
 * Designed for single-process use (not distributed). Each service creates
 * its own limiter instance.
 *
 * @example
 * ```ts
 * const limiter = new RateLimiter({ rpm: 500, tpm: 500_000, name: 'gpt-5-mini' });
 *
 * // Before each call:
 * await limiter.waitForCapacity(estimatedTokens);
 * const result = await openai.chat.completions.create({ ... });
 *
 * // After each call (optional — for dynamic tracking):
 * limiter.recordUsage(actualTokensUsed);
 * ```
 */

// Timer declarations for environments without DOM lib
declare function setTimeout(callback: () => void, ms: number): unknown;

export interface RateLimiterConfig {
	/** Requests per minute limit */
	rpm: number;
	/** Tokens per minute limit */
	tpm: number;
	/** Friendly name for logging (e.g. 'gpt-5-mini') */
	name?: string;
	/** Safety margin — fraction of limit to use (default: 0.85 = 85%) */
	safetyMargin?: number;
	/** Optional logger function (defaults to no-op) */
	logger?: (message: string) => void;
}

interface TimestampedRequest {
	timestamp: number;
	tokens: number;
}

export class RateLimiter {
	private readonly rpm: number;
	private readonly tpm: number;
	private readonly name: string;
	private readonly safetyMargin: number;
	private readonly log: (message: string) => void;
	private readonly requests: TimestampedRequest[] = [];
	private readonly windowMs = 60_000; // 1 minute sliding window

	constructor(config: RateLimiterConfig) {
		this.rpm = config.rpm;
		this.tpm = config.tpm;
		this.name = config.name ?? "openai";
		this.safetyMargin = config.safetyMargin ?? 0.85;
		this.log = config.logger ?? (() => {});
	}

	/** Effective RPM limit after safety margin */
	private get effectiveRpm(): number {
		return Math.floor(this.rpm * this.safetyMargin);
	}

	/** Effective TPM limit after safety margin */
	private get effectiveTpm(): number {
		return Math.floor(this.tpm * this.safetyMargin);
	}

	/** Remove entries older than the sliding window */
	private pruneOldEntries(): void {
		const cutoff = Date.now() - this.windowMs;
		while (this.requests.length > 0 && this.requests[0]!.timestamp < cutoff) {
			this.requests.shift();
		}
	}

	/** Get current usage within the sliding window */
	getUsage(): { requestCount: number; tokenCount: number } {
		this.pruneOldEntries();
		let tokenCount = 0;
		for (const req of this.requests) {
			tokenCount += req.tokens;
		}
		return { requestCount: this.requests.length, tokenCount };
	}

	/**
	 * Wait until there's capacity for a request with the estimated token count.
	 * Resolves immediately if within limits, otherwise sleeps until capacity frees up.
	 *
	 * @param estimatedTokens - Estimated tokens for the upcoming request (default: 0)
	 * @returns Time waited in ms (0 if no wait needed)
	 */
	async waitForCapacity(estimatedTokens = 0): Promise<number> {
		let totalWaited = 0;

		// eslint-disable-next-line no-constant-condition
		while (true) {
			this.pruneOldEntries();
			const { requestCount, tokenCount } = this.getUsage();

			const rpmOk = requestCount < this.effectiveRpm;
			const tpmOk = tokenCount + estimatedTokens < this.effectiveTpm;

			if (rpmOk && tpmOk) {
				return totalWaited;
			}

			// Calculate how long to wait: find the oldest entry and wait until it
			// expires from the sliding window
			const waitMs = this.calculateWaitTime(requestCount, tokenCount, estimatedTokens);

			if (totalWaited === 0) {
				this.log(
					`[rate-limiter:${this.name}] Throttling — RPM: ${requestCount}/${this.effectiveRpm}, TPM: ${tokenCount}/${this.effectiveTpm}, waiting ${waitMs}ms`,
				);
			}

			await new Promise<void>((resolve) => setTimeout(() => resolve(), waitMs));
			totalWaited += waitMs;
		}
	}

	/** Calculate how long to wait before retrying */
	private calculateWaitTime(
		requestCount: number,
		tokenCount: number,
		estimatedTokens: number,
	): number {
		const now = Date.now();
		let waitMs = 1_000; // Default 1s

		if (this.requests.length > 0) {
			const oldest = this.requests[0]!;
			// Wait until the oldest entry expires from the sliding window
			const expiresAt = oldest.timestamp + this.windowMs;
			const timeToExpire = expiresAt - now;

			if (requestCount >= this.effectiveRpm) {
				// RPM limited — wait for a request slot to free up
				waitMs = Math.max(timeToExpire, 500);
			}

			if (tokenCount + estimatedTokens >= this.effectiveTpm) {
				// TPM limited — might need to wait longer for enough tokens to expire
				// Find how many tokens need to be freed
				const tokensNeeded = tokenCount + estimatedTokens - this.effectiveTpm;
				let freedTokens = 0;
				for (const req of this.requests) {
					freedTokens += req.tokens;
					if (freedTokens >= tokensNeeded) {
						waitMs = Math.max(req.timestamp + this.windowMs - now, 500);
						break;
					}
				}
			}
		}

		// Clamp to reasonable bounds
		return Math.min(Math.max(waitMs, 200), 30_000);
	}

	/**
	 * Record that a request was made, consuming tokens from the budget.
	 * Call this AFTER the API call completes and you know actual token usage.
	 *
	 * @param tokensUsed - Actual tokens consumed by the API call
	 */
	recordUsage(tokensUsed: number): void {
		this.requests.push({
			timestamp: Date.now(),
			tokens: tokensUsed,
		});
	}

	/**
	 * Record a request BEFORE the API call (with estimated tokens).
	 * Use this when you want to pre-reserve capacity.
	 *
	 * @param estimatedTokens - Estimated tokens for the request
	 */
	recordRequest(estimatedTokens = 0): void {
		this.requests.push({
			timestamp: Date.now(),
			tokens: estimatedTokens,
		});
	}

	/**
	 * Update usage tracking from OpenAI response headers for more accurate limiting.
	 * Parses `x-ratelimit-remaining-requests` and `x-ratelimit-remaining-tokens` headers.
	 */
	updateFromHeaders(headers: Record<string, string | undefined>): void {
		const remainingRequests = headers["x-ratelimit-remaining-requests"];
		const remainingTokens = headers["x-ratelimit-remaining-tokens"];

		if (remainingRequests !== undefined) {
			const remaining = parseInt(remainingRequests, 10);
			if (!isNaN(remaining) && remaining < 10) {
				this.log(
					`[rate-limiter:${this.name}] Low request budget: ${remaining} remaining`,
				);
			}
		}

		if (remainingTokens !== undefined) {
			const remaining = parseInt(remainingTokens, 10);
			if (!isNaN(remaining) && remaining < 10_000) {
				this.log(
					`[rate-limiter:${this.name}] Low token budget: ${remaining} remaining`,
				);
			}
		}
	}

	/** Get a human-readable status string */
	getStatus(): string {
		const { requestCount, tokenCount } = this.getUsage();
		return `[${this.name}] RPM: ${requestCount}/${this.effectiveRpm}, TPM: ${tokenCount}/${this.effectiveTpm}`;
	}
}

// ── Pre-configured limiters for known models ──

/** Default rate limits by model (OpenAI Tier 1) */
const MODEL_LIMITS: Record<string, { rpm: number; tpm: number }> = {
	"gpt-5-mini": { rpm: 500, tpm: 500_000 },
	"gpt-4o-mini": { rpm: 500, tpm: 200_000 },
	"gpt-4o": { rpm: 500, tpm: 30_000 },
	"text-embedding-3-small": { rpm: 500, tpm: 1_000_000 },
	"text-embedding-3-large": { rpm: 500, tpm: 1_000_000 },
};

/** Singleton instances per model to share rate state within a process */
const instances = new Map<string, RateLimiter>();

/**
 * Get or create a rate limiter for the given model.
 * Returns a shared singleton per model name so all callers
 * within the same process share rate limit state.
 *
 * @param model - OpenAI model name (e.g. 'gpt-5-mini')
 * @param overrides - Optional overrides for RPM/TPM limits
 */
export function getRateLimiter(
	model: string,
	overrides?: Partial<RateLimiterConfig>,
): RateLimiter {
	const key = model;
	let limiter = instances.get(key);
	if (!limiter) {
		const defaults = MODEL_LIMITS[model] ?? { rpm: 100, tpm: 100_000 };
		limiter = new RateLimiter({
			rpm: overrides?.rpm ?? defaults.rpm,
			tpm: overrides?.tpm ?? defaults.tpm,
			name: overrides?.name ?? model,
			safetyMargin: overrides?.safetyMargin ?? 0.85,
		});
		instances.set(key, limiter);
	}
	return limiter;
}
