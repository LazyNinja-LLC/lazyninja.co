import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Project } from '../../shared/github/types';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { GitHubCache } from '../src/lib/github-cache';
import type { Mailer } from '../src/lib/mailer';
import { MemoryStore } from '../src/store/memory';

const ADMIN = 'admin-token-that-is-long-enough-123';
const NOW = new Date('2026-11-17T12:00:00Z');

function project(key: string, source: Project['source']): Project {
  const [owner = '', name = ''] = key.split('/');
  return {
    key: key.toLowerCase(),
    owner,
    name,
    source,
    sourceLabel: source === 'lazyninja' ? 'LazyNinja' : 'Personal',
    title: name,
    description: '',
    url: `https://github.com/${key}`,
    homepage: null,
    topics: [],
    tags: [],
    status: 'shipped',
    featured: false,
    languages: [],
    stars: 3,
    forks: 0,
    archived: false,
    pushedAt: null,
    updatedAt: null,
  };
}

function setup(opts: { env?: Record<string, string>; mailer?: Mailer | null } = {}) {
  const config = loadConfig({ NODE_ENV: 'test', ADMIN_TOKEN: ADMIN, ...opts.env });
  const store = new MemoryStore();
  const fetcher = vi.fn(async () => [
    project('LazyNinja-LLC/site', 'lazyninja'),
    project('WammumTy/site', 'personal'),
  ]);
  const github = new GitHubCache(store, fetcher, { now: () => NOW.getTime() });
  const sent: unknown[] = [];
  const mailer: Mailer | null =
    opts.mailer === undefined ? { sendContact: async (m) => void sent.push(m) } : opts.mailer;
  const app = createApp({ config, store, mailer, github, now: () => new Date(NOW) });
  return { app, store, fetcher, sent };
}

const contact = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  reason: 'general',
  message: 'Hello there, this is a test message.',
  website: '',
  startedAt: NOW.getTime() - 10_000,
};

describe('GET /health', () => {
  it('returns ok and a version', async () => {
    const res = await request(setup().app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, version: expect.any(String) });
  });
});

describe('CORS', () => {
  it('allows lazyninja.co and www, rejects others', async () => {
    const { app } = setup();
    for (const origin of ['https://lazyninja.co', 'https://www.lazyninja.co']) {
      const res = await request(app).get('/health').set('Origin', origin);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
    }
    const evil = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers preflight requests', async () => {
    const res = await request(setup().app)
      .options('/contact')
      .set('Origin', 'https://lazyninja.co')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
  });

  it('allows localhost outside production only', async () => {
    const dev = await request(setup().app).get('/health').set('Origin', 'http://localhost:4321');
    expect(dev.headers['access-control-allow-origin']).toBe('http://localhost:4321');
  });
});

describe('GET /github/repos', () => {
  it('fills an empty cache once, then serves from the cache', async () => {
    const { app, fetcher } = setup();
    const first = await request(app).get('/github/repos');
    expect(first.status).toBe(200);
    expect(first.body.repos).toHaveLength(2);
    await request(app).get('/github/repos');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('filters by source and validates the parameter', async () => {
    const { app } = setup();
    const res = await request(app).get('/github/repos?source=personal');
    expect(res.body.repos.map((r: Project) => r.key)).toEqual(['wammumty/site']);
    expect((await request(app).get('/github/repos?source=nope')).status).toBe(400);
  });
});

describe('POST /contact', () => {
  it('sends mail with the visitor as reply-to and stores the message', async () => {
    const { app, store, sent } = setup();
    const res = await request(app).post('/contact').send(contact);
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toMatchObject({ email: 'ada@example.com', mailStatus: 'sent' });
    expect(store.messages[0]!.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns field errors for invalid input', async () => {
    const res = await request(setup().app)
      .post('/contact')
      .send({ ...contact, email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('email');
  });

  it('silently drops honeypot submissions', async () => {
    const { app, store, sent } = setup();
    const res = await request(app)
      .post('/contact')
      .send({ ...contact, website: 'spam' });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(0);
    expect(store.messages).toHaveLength(0);
  });

  it('rejects submissions made under 3 seconds after page load', async () => {
    const res = await request(setup().app)
      .post('/contact')
      .send({ ...contact, startedAt: NOW.getTime() - 1000 });
    expect(res.status).toBe(400);
  });

  it('rate limits to 5 per IP per hour', async () => {
    const { app } = setup();
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await request(app).post('/contact').send(contact)).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it('still succeeds (stored) when mail fails', async () => {
    const { app, store } = setup({
      mailer: {
        sendContact: async () => {
          throw new Error('smtp down');
        },
      },
    });
    const res = await request(app).post('/contact').send(contact);
    expect(res.status).toBe(200);
    expect(store.messages[0]!.mailStatus).toBe('failed');
  });

  it('rejects bodies over 20 KB', async () => {
    const res = await request(setup().app)
      .post('/contact')
      .send({ ...contact, message: 'x'.repeat(25_000) });
    expect(res.status).toBe(413);
  });
});

describe('POST /track', () => {
  const ua = 'Mozilla/5.0 (Windows NT 10.0) Firefox/140.0';

  it('records a cookie-free page view from a text/plain beacon', async () => {
    const { app, store } = setup();
    const res = await request(app)
      .post('/track')
      .set('Content-Type', 'text/plain')
      .set('User-Agent', ua)
      .send(JSON.stringify({ path: '/blog/hello.html', referrer: 'news.ycombinator.com' }));
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(store.pageViews[0]).toMatchObject({ path: '/blog/hello', referrerHost: 'news.ycombinator.com' });
    expect(JSON.stringify(store.pageViews[0])).not.toContain('127.0.0.1');
  });

  it('ignores DNT requests and bots', async () => {
    const { app, store } = setup();
    await request(app).post('/track').set('DNT', '1').set('User-Agent', ua).send({ path: '/' });
    await request(app).post('/track').set('User-Agent', 'Googlebot').send({ path: '/' });
    expect(store.pageViews).toHaveLength(0);
  });

  it('rejects invalid payloads', async () => {
    const res = await request(setup().app).post('/track').set('User-Agent', ua).send({ path: 'no-slash' });
    expect(res.status).toBe(400);
  });
});

describe('GET /stats', () => {
  it('requires the admin bearer token', async () => {
    const { app } = setup();
    expect((await request(app).get('/stats')).status).toBe(401);
    expect((await request(app).get('/stats').set('Authorization', 'Bearer wrong')).status).toBe(401);
  });

  it('returns 7 and 30 day stats', async () => {
    const { app } = setup();
    const ua = 'Mozilla/5.0 Firefox/140.0';
    await request(app).post('/track').set('User-Agent', ua).send({ path: '/', referrer: 'google.com' });
    await request(app).post('/track').set('User-Agent', ua).send({ path: '/projects' });
    const res = await request(app).get('/stats').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    const [week, month] = res.body.periods;
    expect(week).toMatchObject({ days: 7, pageViews: 2, uniqueVisitors: 1 });
    expect(month.days).toBe(30);
    expect(week.topReferrers).toEqual([{ key: 'google.com', count: 1 }]);
  });
});

describe('errors', () => {
  it('returns JSON 404s', async () => {
    const res = await request(setup().app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('never leaks stack traces in production', async () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      DB_HOST: 'x',
      DB_USER: 'x',
      DB_PASSWORD: 'x',
      DB_NAME: 'x',
      SMTP_HOST: 'x',
      SMTP_USER: 'x',
      SMTP_PASS: 'x',
      ADMIN_TOKEN: ADMIN,
      ANALYTICS_SALT_SECRET: 'salt-secret-that-is-long-enough',
    });
    const store = new MemoryStore();
    store.getRepoCache = async () => {
      throw new Error('db exploded at /secret/path.js:12');
    };
    const github = new GitHubCache(store, async () => []);
    const app = createApp({ config, store, mailer: null, github });
    const res = await request(app).get('/github/repos');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
