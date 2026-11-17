import { describe, expect, it } from 'vitest';
import {
  countryFromHeaders,
  dailySalt,
  isBot,
  normalizePath,
  normalizeReferrerHost,
  optedOut,
  visitorHash,
} from '../src/lib/analytics';
import { retentionCutoff } from '../src/lib/retention';

const SECRET = 'test-secret-that-is-long-enough';
const DAY1 = new Date('2026-11-17T08:00:00Z');
const DAY1_LATER = new Date('2026-11-17T23:59:59Z');
const DAY2 = new Date('2026-11-18T00:00:01Z');
const UA = 'Mozilla/5.0 (Windows NT 10.0) Firefox/140.0';

describe('analytics hashing', () => {
  it('is stable for the same visitor within a UTC day', () => {
    expect(visitorHash(SECRET, DAY1, '203.0.113.7', UA)).toBe(
      visitorHash(SECRET, DAY1_LATER, '203.0.113.7', UA),
    );
  });

  it('rotates daily, so visitors cannot be linked across days', () => {
    expect(dailySalt(SECRET, DAY1)).not.toBe(dailySalt(SECRET, DAY2));
    expect(visitorHash(SECRET, DAY1, '203.0.113.7', UA)).not.toBe(
      visitorHash(SECRET, DAY2, '203.0.113.7', UA),
    );
  });

  it('differs per IP, per user agent and per secret', () => {
    const base = visitorHash(SECRET, DAY1, '203.0.113.7', UA);
    expect(visitorHash(SECRET, DAY1, '203.0.113.8', UA)).not.toBe(base);
    expect(visitorHash(SECRET, DAY1, '203.0.113.7', `${UA} x`)).not.toBe(base);
    expect(visitorHash('another-secret-long-enough!!', DAY1, '203.0.113.7', UA)).not.toBe(base);
  });

  it('never contains the raw IP and has a fixed length', () => {
    const h = visitorHash(SECRET, DAY1, '203.0.113.7', UA);
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(h).not.toContain('203.0.113.7');
  });
});

describe('analytics helpers', () => {
  it('normalizes paths to clean URLs', () => {
    expect(normalizePath('/blog/post.html?x=1#y')).toBe('/blog/post');
    expect(normalizePath('/projects/')).toBe('/projects');
    expect(normalizePath('/index.html')).toBe('/');
    expect(normalizePath('/')).toBe('/');
  });

  it('keeps only valid external referrer hosts', () => {
    expect(normalizeReferrerHost('news.ycombinator.com', ['lazyninja.co'])).toBe('news.ycombinator.com');
    expect(normalizeReferrerHost('www.google.com', ['lazyninja.co'])).toBe('google.com');
    expect(normalizeReferrerHost('lazyninja.co', ['lazyninja.co'])).toBeNull();
    expect(normalizeReferrerHost('www.lazyninja.co', ['lazyninja.co'])).toBeNull();
    expect(normalizeReferrerHost('<script>', ['lazyninja.co'])).toBeNull();
    expect(normalizeReferrerHost(null, [])).toBeNull();
  });

  it('reads a country code from proxy headers when available', () => {
    expect(countryFromHeaders({ 'cf-ipcountry': 'us' })).toBe('US');
    expect(countryFromHeaders({ 'cf-ipcountry': 'XX' })).toBeNull();
    expect(countryFromHeaders({})).toBeNull();
  });

  it('respects DNT / GPC and skips bots', () => {
    expect(optedOut({ dnt: '1' })).toBe(true);
    expect(optedOut({ 'sec-gpc': '1' })).toBe(true);
    expect(optedOut({})).toBe(false);
    expect(isBot('Googlebot/2.1')).toBe(true);
    expect(isBot('Mozilla/5.0 Chrome-Lighthouse')).toBe(true);
    expect(isBot(undefined)).toBe(true);
    expect(isBot(UA)).toBe(false);
  });

  it('purges after 13 months', () => {
    expect(retentionCutoff(new Date('2026-11-17T00:00:00Z')).toISOString()).toBe('2025-10-17T00:00:00.000Z');
  });
});
