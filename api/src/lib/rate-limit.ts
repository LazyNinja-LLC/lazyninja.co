import type { Store } from '../store/types';

export interface RateLimitOptions {
  bucket: string;
  limit: number;
  windowMs: number;
  now?: () => Date;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetAt: Date;
}

/**
 * Fixed-window rate limiter backed by the Store (MySQL in production), so state
 * survives Passenger restarts and is shared by every app process.
 */
export class RateLimiter {
  constructor(
    private readonly store: Store,
    private readonly options: RateLimitOptions,
  ) {}

  windowStart(at: Date): Date {
    const ms = at.getTime();
    return new Date(ms - (ms % this.options.windowMs));
  }

  /** Counts one hit for `keyHash` and reports whether it is within the limit. */
  async hit(keyHash: string): Promise<RateLimitResult> {
    const now = this.options.now?.() ?? new Date();
    const start = this.windowStart(now);
    const count = await this.store.incrementRateLimit(this.options.bucket, keyHash, start);
    return {
      allowed: count <= this.options.limit,
      count,
      limit: this.options.limit,
      remaining: Math.max(0, this.options.limit - count),
      resetAt: new Date(start.getTime() + this.options.windowMs),
    };
  }
}
