import type { Project } from '../../../shared/github/types';

export type ContactReason = 'general' | 'hire' | 'recruiting';
export type MailStatus = 'sent' | 'failed' | 'skipped';

export interface ContactMessage {
  name: string;
  email: string;
  reason: ContactReason;
  message: string;
  ipHash: string;
  userAgent: string | null;
  mailStatus: MailStatus;
  createdAt: Date;
}

export interface PageView {
  path: string;
  referrerHost: string | null;
  country: string | null;
  visitorHash: string;
  createdAt: Date;
}

export interface CountRow {
  key: string;
  count: number;
}

export interface PeriodStats {
  days: number;
  pageViews: number;
  /** Sum of daily unique visitors (hashes rotate daily, so cross-day uniqueness is unknowable by design). */
  uniqueVisitors: number;
  topPages: CountRow[];
  topReferrers: CountRow[];
  daily: { day: string; views: number; visitors: number }[];
}

export interface RepoCache {
  projects: Project[];
  syncedAt: Date | null;
}

/** Persistence used by the API. MySQL in production, memory for local dev and tests. */
export interface Store {
  readonly kind: 'mysql' | 'memory';
  ping(): Promise<void>;

  getRepoCache(): Promise<RepoCache>;
  saveRepoCache(projects: Project[], syncedAt: Date): Promise<void>;

  saveContactMessage(message: ContactMessage): Promise<number>;

  /** Atomically increments the hit counter for (bucket, key, window) and returns the new count. */
  incrementRateLimit(bucket: string, keyHash: string, windowStart: Date): Promise<number>;

  recordPageView(view: PageView): Promise<void>;
  getStats(days: number, now: Date): Promise<PeriodStats>;

  /** Deletes page views created before `before` and expired rate-limit windows. Returns rows removed. */
  purge(options: {
    pageViewsBefore: Date;
    rateLimitsBefore: Date;
  }): Promise<{ pageViews: number; rateLimits: number }>;

  close(): Promise<void>;
}
