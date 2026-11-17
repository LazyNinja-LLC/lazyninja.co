import { describe, expect, it } from 'vitest';
import { checkContact, MIN_FILL_MS } from '../src/lib/contact-schema';

const NOW = 1_800_000_000_000;
const valid = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  reason: 'hire',
  message: 'I would like a small tool built.',
  website: '',
  startedAt: NOW - 10_000,
};

describe('contact validation', () => {
  it('accepts a valid submission and trims fields', () => {
    const r = checkContact({ ...valid, name: '  Ada Lovelace  ' }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.name).toBe('Ada Lovelace');
  });

  it('defaults the reason to general', () => {
    const { reason: _reason, ...rest } = valid;
    const r = checkContact(rest, NOW);
    expect(r.ok && r.data.reason).toBe('general');
  });

  it.each([
    ['name', { name: 'A' }],
    ['name', { name: 'Ada\r\nBcc: victim@example.com' }],
    ['email', { email: 'not-an-email' }],
    ['message', { message: 'short' }],
    ['message', { message: 'x'.repeat(5001) }],
    ['reason', { reason: 'spam' }],
    ['startedAt', { startedAt: 'yesterday' }],
  ])('rejects an invalid %s', (field, patch) => {
    const r = checkContact({ ...valid, ...patch }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'invalid') expect(Object.keys(r.errors)).toContain(field);
    else throw new Error(`expected invalid, got ${JSON.stringify(r)}`);
  });

  it('flags the honeypot', () => {
    expect(checkContact({ ...valid, website: 'https://spam.example' }, NOW)).toEqual({
      ok: false,
      kind: 'honeypot',
    });
  });

  it('rejects submissions faster than 3 seconds after page load', () => {
    expect(checkContact({ ...valid, startedAt: NOW - (MIN_FILL_MS - 1) }, NOW)).toEqual({
      ok: false,
      kind: 'too-fast',
    });
    expect(checkContact({ ...valid, startedAt: NOW - MIN_FILL_MS }, NOW).ok).toBe(true);
  });

  it('rejects non-object payloads', () => {
    expect(checkContact(null, NOW).ok).toBe(false);
    expect(checkContact('hello', NOW).ok).toBe(false);
  });
});
