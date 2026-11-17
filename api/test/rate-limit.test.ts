import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/lib/rate-limit';
import { MemoryStore } from '../src/store/memory';

const HOUR = 60 * 60 * 1000;

function setup(start = Date.UTC(2026, 10, 17, 10, 15)) {
  let now = start;
  const store = new MemoryStore();
  const limiter = new RateLimiter(store, {
    bucket: 'contact',
    limit: 5,
    windowMs: HOUR,
    now: () => new Date(now),
  });
  return { store, limiter, advance: (ms: number) => (now += ms) };
}

describe('RateLimiter', () => {
  it('allows 5 hits per key per hour, then blocks', async () => {
    const { limiter } = setup();
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await limiter.hit('ip-a'));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, true, true, false]);
    expect(results[4]!.remaining).toBe(0);
    expect(results[5]!.count).toBe(6);
  });

  it('tracks keys independently', async () => {
    const { limiter } = setup();
    for (let i = 0; i < 5; i++) await limiter.hit('ip-a');
    expect((await limiter.hit('ip-b')).allowed).toBe(true);
    expect((await limiter.hit('ip-a')).allowed).toBe(false);
  });

  it('resets in the next window and reports the reset time', async () => {
    const { limiter, advance } = setup(Date.UTC(2026, 10, 17, 10, 15));
    let last;
    for (let i = 0; i < 6; i++) last = await limiter.hit('ip-a');
    expect(last!.allowed).toBe(false);
    expect(last!.resetAt.toISOString()).toBe('2026-11-17T11:00:00.000Z');
    advance(HOUR);
    expect((await limiter.hit('ip-a')).allowed).toBe(true);
  });

  it('persists counts in the store (survives a new limiter instance, e.g. after a restart)', async () => {
    const { store } = setup();
    const opts = {
      bucket: 'contact',
      limit: 5,
      windowMs: HOUR,
      now: () => new Date(Date.UTC(2026, 10, 17, 10)),
    };
    for (let i = 0; i < 5; i++) await new RateLimiter(store, opts).hit('ip-a');
    expect((await new RateLimiter(store, opts).hit('ip-a')).allowed).toBe(false);
  });
});
