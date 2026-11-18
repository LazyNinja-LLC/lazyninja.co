import { z } from 'zod';
import { DEFAULT_EXCLUDE_PATTERNS, parseSourcesEnv } from '../../shared/github/filter';
import type { GitHubSource } from '../../shared/github/types';

declare const __APP_VERSION__: string | undefined;
export const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    STORE: z.preprocess(emptyToUndefined, z.enum(['mysql', 'memory']).optional()),
    DB_HOST: optionalString,
    DB_PORT: z.coerce.number().int().positive().default(3306),
    DB_USER: optionalString,
    DB_PASSWORD: optionalString,
    DB_NAME: optionalString,
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().positive().default(465),
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    MAIL_TO: z.preprocess(emptyToUndefined, z.email().default('tyler@lazyninja.co')),
    MAIL_FROM: z.preprocess(emptyToUndefined, z.email().optional()),
    GITHUB_SOURCES: optionalString,
    GITHUB_TOKEN: optionalString,
    GITHUB_EXCLUDE_PATTERN: optionalString,
    GITHUB_CACHE_MINUTES: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(5).max(1440).default(60),
    ),
    ADMIN_TOKEN: optionalString,
    ANALYTICS_SALT_SECRET: optionalString,
    ALLOWED_ORIGINS: z.preprocess(
      emptyToUndefined,
      z.string().default('https://lazyninja.co,https://www.lazyninja.co'),
    ),
    TRUST_PROXY: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).default(1)),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    const required = [
      'DB_HOST',
      'DB_USER',
      'DB_PASSWORD',
      'DB_NAME',
      'SMTP_HOST',
      'SMTP_USER',
      'SMTP_PASS',
      'ADMIN_TOKEN',
      'ANALYTICS_SALT_SECRET',
    ] as const;
    for (const key of required) {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` });
    }
    if (env.STORE === 'memory') {
      ctx.addIssue({ code: 'custom', path: ['STORE'], message: 'STORE=memory is for development only' });
    }
    for (const key of ['ADMIN_TOKEN', 'ANALYTICS_SALT_SECRET'] as const) {
      if (env[key] && env[key].length < 24) {
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} must be at least 24 characters` });
      }
    }
  });

export interface Config {
  env: 'development' | 'production' | 'test';
  isProd: boolean;
  port: number;
  store: 'mysql' | 'memory';
  db: { host: string; port: number; user: string; password: string; database: string };
  smtp: { host?: string; port: number; user?: string; pass?: string } | null;
  mail: { to: string; from: string };
  github: { sources: GitHubSource[]; token?: string; excludePatterns: string[]; cacheMaxAgeMs: number };
  adminToken: string | null;
  analyticsSecret: string;
  allowedOrigins: string[];
  trustProxy: number;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid API configuration:\n${details}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === 'production';
  const store = env.STORE ?? (isProd || env.DB_HOST ? 'mysql' : 'memory');

  return {
    env: env.NODE_ENV,
    isProd,
    port: env.PORT,
    store,
    db: {
      host: env.DB_HOST ?? 'localhost',
      port: env.DB_PORT,
      user: env.DB_USER ?? 'root',
      password: env.DB_PASSWORD ?? '',
      database: env.DB_NAME ?? 'lazyninja',
    },
    smtp: env.SMTP_HOST
      ? { host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER, pass: env.SMTP_PASS }
      : null,
    mail: { to: env.MAIL_TO, from: env.MAIL_FROM ?? env.SMTP_USER ?? 'no-reply@lazyninja.co' },
    github: {
      sources: parseSourcesEnv(env.GITHUB_SOURCES),
      token: env.GITHUB_TOKEN,
      excludePatterns: env.GITHUB_EXCLUDE_PATTERN ? [env.GITHUB_EXCLUDE_PATTERN] : DEFAULT_EXCLUDE_PATTERNS,
      cacheMaxAgeMs: env.GITHUB_CACHE_MINUTES * 60 * 1000,
    },
    adminToken: env.ADMIN_TOKEN ?? null,
    // Dev fallback only; production requires a real secret (enforced above).
    analyticsSecret: env.ANALYTICS_SALT_SECRET ?? 'dev-only-analytics-secret',
    allowedOrigins: env.ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    trustProxy: env.TRUST_PROXY,
  };
}
