import express, { type Request } from 'express';
import helmet from 'helmet';
import { VERSION, type Config } from './config';
import {
  countryFromHeaders,
  isBot,
  normalizePath,
  normalizeReferrerHost,
  optedOut,
  TrackSchema,
  visitorHash,
} from './lib/analytics';
import { checkContact } from './lib/contact-schema';
import { hmacSha256 } from './lib/crypto';
import type { GitHubCache } from './lib/github-cache';
import { cors, errorHandler, HttpError, notFound } from './lib/http';
import type { Mailer } from './lib/mailer';
import { RateLimiter } from './lib/rate-limit';
import type { RepoClient } from './lib/repo-client';
import { adminRouter, requireAdmin } from './routes/admin';
import type { MailStatus, Store } from './store/types';

export interface AppDeps {
  config: Config;
  store: Store;
  mailer: Mailer | null;
  github: GitHubCache;
  /** GitHub client for the admin editor; null when GITHUB_WRITE_TOKEN isn't set. */
  repo?: RepoClient | null;
  now?: () => Date;
}

const OWN_HOSTS = ['lazyninja.co', 'www.lazyninja.co'];

export function createApp({ config, store, mailer, github, repo = null, now = () => new Date() }: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    }),
  );
  app.use(cors(config.allowedOrigins, { allowLocalhost: !config.isProd }));
  // 20 KB JSON limit for every public route. /admin parses its own (larger) bodies after auth.
  const smallJson = express.json({ limit: '20kb' });
  app.use((req, res, next) => (req.path.startsWith('/admin/') ? next() : smallJson(req, res, next)));
  // sendBeacon posts text/plain (CORS-safelisted, no preflight).
  app.use(express.text({ type: 'text/plain', limit: '2kb' }));

  const contactLimiter = new RateLimiter(store, {
    bucket: 'contact',
    limit: 5,
    windowMs: 60 * 60 * 1000,
    now,
  });
  const ipKey = (req: Request) => hmacSha256(config.analyticsSecret, `ip:${req.ip ?? 'unknown'}`);

  app.get('/health', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ ok: true, version: VERSION });
  });

  app.get('/github/repos', async (req, res) => {
    const source = req.query.source;
    if (source !== undefined && source !== 'lazyninja' && source !== 'personal') {
      throw new HttpError(400, 'source must be "lazyninja" or "personal"');
    }
    const cache = await github.get();
    const repos = source ? cache.projects.filter((p) => p.source === source) : cache.projects;
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ syncedAt: cache.syncedAt?.toISOString() ?? null, stale: cache.stale, repos });
  });

  app.post('/contact', async (req, res) => {
    const limit = await contactLimiter.hit(ipKey(req));
    res.set('RateLimit-Limit', String(limit.limit));
    res.set('RateLimit-Remaining', String(limit.remaining));
    if (!limit.allowed) {
      res.set('Retry-After', String(Math.ceil((limit.resetAt.getTime() - now().getTime()) / 1000)));
      throw new HttpError(429, 'Too many messages. Please try again later.');
    }

    const check = checkContact(req.body, now().getTime());
    if (!check.ok) {
      if (check.kind === 'invalid') throw new HttpError(400, 'Please check the form.', check.errors);
      if (check.kind === 'too-fast')
        throw new HttpError(400, 'That was quick! Please take a moment and try again.');
      // Honeypot: pretend success so bots learn nothing.
      res.status(200).json({ ok: true });
      return;
    }

    let mailStatus: MailStatus = 'skipped';
    if (mailer) {
      try {
        await mailer.sendContact(check.data);
        mailStatus = 'sent';
      } catch (err) {
        mailStatus = 'failed';
        console.error(`[contact] mail failed: ${(err as Error).message}`);
      }
    }

    let stored = false;
    try {
      await store.saveContactMessage({
        name: check.data.name,
        email: check.data.email,
        reason: check.data.reason,
        message: check.data.message,
        ipHash: ipKey(req),
        userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
        mailStatus,
        createdAt: now(),
      });
      stored = true;
    } catch (err) {
      console.error(`[contact] store failed: ${(err as Error).message}`);
    }

    // Success if the message reached the inbox or was saved for later.
    if (mailStatus !== 'sent' && !stored) throw new HttpError(502, 'Could not deliver your message.');
    res.status(200).json({ ok: true });
  });

  app.post('/track', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const ua = req.get('user-agent');
    if (optedOut(req.headers) || isBot(ua)) {
      res.status(204).end();
      return;
    }
    let body: unknown = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        throw new HttpError(400, 'Malformed JSON');
      }
    }
    const parsed = TrackSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid page view');

    const at = now();
    await store.recordPageView({
      path: normalizePath(parsed.data.path),
      referrerHost: normalizeReferrerHost(parsed.data.referrer, OWN_HOSTS),
      country: countryFromHeaders(req.headers),
      visitorHash: visitorHash(config.analyticsSecret, at, req.ip ?? '', ua ?? ''),
      createdAt: at,
    });
    res.status(204).end();
  });

  app.get('/stats', requireAdmin({ config, store, now }), async (_req, res) => {
    const at = now();
    const [week, month] = await Promise.all([store.getStats(7, at), store.getStats(30, at)]);
    res.set('Cache-Control', 'no-store');
    res.json({ generatedAt: at.toISOString(), periods: [week, month] });
  });

  app.use('/admin', adminRouter({ config, store, github, repo, now }));

  app.use(notFound);
  app.use(errorHandler({ isProd: config.isProd }));
  return app;
}
