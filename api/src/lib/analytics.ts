import { z } from 'zod';
import { hmacSha256, sha256 } from './crypto';

/** UTC calendar day, e.g. "2026-11-17". */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Daily salt derived from a server secret. It changes every UTC day and is
 * never stored, so yesterday's hashes can't be linked to today's.
 */
export function dailySalt(secret: string, date: Date): string {
  return hmacSha256(secret, `analytics-salt:${utcDay(date)}`);
}

/**
 * Anonymous visitor id: hash(daily salt + IP + user agent), truncated.
 * Counts unique visitors per day without storing IPs or setting cookies.
 */
export function visitorHash(secret: string, date: Date, ip: string, userAgent: string): string {
  return sha256(`${dailySalt(secret, date)}|${ip}|${userAgent}`).slice(0, 32);
}

export const TrackSchema = z.object({
  path: z
    .string()
    .max(512)
    .regex(/^\/[^\s]*$/, 'path must start with /'),
  referrer: z.string().max(255).nullish(),
});

const BOT_RE =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|monitor|curl|wget|python-requests|httpclient|go-http/i;

export function isBot(userAgent: string | undefined): boolean {
  return !userAgent || BOT_RE.test(userAgent);
}

/** Path only: strip query/hash, collapse trailing slash, drop ".html" to match clean URLs. */
export function normalizePath(path: string): string {
  let p = path.split(/[?#]/)[0] ?? '/';
  p = p.replace(/\.html$/, '').replace(/\/index$/, '/');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

/** Valid hostname (lowercased) or null. Own hosts are treated as no referrer. */
export function normalizeReferrerHost(value: string | null | undefined, ownHosts: string[]): string | null {
  if (!value) return null;
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
  if (!/^[a-z0-9.-]+(:\d+)?$/.test(host) || host.length > 255) return null;
  if (ownHosts.some((h) => host === h.replace(/^www\./, ''))) return null;
  return host;
}

const COUNTRY_HEADERS = [
  'cf-ipcountry',
  'x-country-code',
  'x-geoip-country',
  'geoip-country-code',
  'x-vercel-ip-country',
];

/** Two-letter country code from common proxy/CDN headers, if present. */
export function countryFromHeaders(headers: Record<string, string | string[] | undefined>): string | null {
  for (const name of COUNTRY_HEADERS) {
    const raw = headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && /^[A-Za-z]{2}$/.test(value) && value.toUpperCase() !== 'XX') return value.toUpperCase();
  }
  return null;
}

/** Honors Do Not Track and Global Privacy Control at the server too. */
export function optedOut(headers: Record<string, string | string[] | undefined>): boolean {
  return headers['dnt'] === '1' || headers['sec-gpc'] === '1';
}
