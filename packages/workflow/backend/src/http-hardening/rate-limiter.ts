export interface IRateLimitResult {
  readonly allowed: boolean;
  /** Seconds until the key's window resets (for `Retry-After`). */
  readonly retryAfterSeconds: number;
}

interface IWindow {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window in-memory counter with bounded memory: expired windows are swept periodically (on hit) and, if the
 * map still exceeds `maxKeys`, the oldest-inserted keys are dropped first.
 */
export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, IWindow>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private lastSweep = 0;

  constructor(limit: number, windowMs: number, maxKeys = 50_000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
  }

  get size(): number {
    return this.windows.size;
  }

  hit(key: string, now = Date.now()): IRateLimitResult {
    this.sweep(now);
    let entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.windows.delete(key);
      this.windows.set(key, entry);
    }
    entry.count += 1;
    this.evictOverflow();
    return {
      allowed: entry.count <= this.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  private sweep(now: number): void {
    if (now - this.lastSweep >= Math.min(this.windowMs, 60_000) || this.windows.size > this.maxKeys) {
      this.lastSweep = now;
      for (const [key, entry] of this.windows) {
        if (entry.resetAt <= now) this.windows.delete(key);
      }
    }
  }

  /** Too many live keys: evict the oldest inserted (Map iterates in insertion order). */
  private evictOverflow(): void {
    while (this.windows.size > this.maxKeys) {
      const oldest = this.windows.keys().next();
      if (oldest.done) break;
      this.windows.delete(oldest.value);
    }
  }
}
