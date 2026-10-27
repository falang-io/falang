import { describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter } from './rate-limiter.js';

describe('FixedWindowRateLimiter', () => {
  it('allows up to the limit then rejects with a retry-after', () => {
    const limiter = new FixedWindowRateLimiter(2, 60_000);
    expect(limiter.hit('a', 0).allowed).toBe(true);
    expect(limiter.hit('a', 1000).allowed).toBe(true);
    const third = limiter.hit('a', 2000);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBe(58);
  });
  it('keeps keys independent and resets after the window', () => {
    const limiter = new FixedWindowRateLimiter(1, 1000);
    expect(limiter.hit('a', 0).allowed).toBe(true);
    expect(limiter.hit('b', 0).allowed).toBe(true);
    expect(limiter.hit('a', 500).allowed).toBe(false);
    expect(limiter.hit('a', 1000).allowed).toBe(true);
  });
  it('sweeps expired keys and bounds memory', () => {
    const limiter = new FixedWindowRateLimiter(1, 1000, 3);
    for (const key of ['a', 'b', 'c']) limiter.hit(key, 0);
    limiter.hit('d', 5000);
    expect(limiter.size).toBe(1);
    for (const key of ['e', 'f', 'g', 'h']) limiter.hit(key, 5000);
    expect(limiter.size).toBeLessThanOrEqual(3);
  });
});
