import type { Project } from '../../../shared/github/types';
import type { ContactMessage, CountRow, PageView, PeriodStats, RepoCache, Store } from './types';

/**
 * In-memory store for local development and tests only. Data is lost on restart,
 * which is exactly why production refuses to use it.
 */
export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  repoCache: RepoCache = { projects: [], syncedAt: null };
  messages: (ContactMessage & { id: number })[] = [];
  rateLimits = new Map<string, { windowStart: Date; hits: number }>();
  pageViews: PageView[] = [];

  async ping() {}

  async getRepoCache(): Promise<RepoCache> {
    return { projects: [...this.repoCache.projects], syncedAt: this.repoCache.syncedAt };
  }

  async saveRepoCache(projects: Project[], syncedAt: Date) {
    this.repoCache = { projects: [...projects], syncedAt };
  }

  async saveContactMessage(message: ContactMessage) {
    const id = this.messages.length + 1;
    this.messages.push({ ...message, id });
    return id;
  }

  async incrementRateLimit(bucket: string, keyHash: string, windowStart: Date) {
    const k = `${bucket}:${keyHash}:${windowStart.toISOString()}`;
    const entry = this.rateLimits.get(k) ?? { windowStart, hits: 0 };
    entry.hits += 1;
    this.rateLimits.set(k, entry);
    return entry.hits;
  }

  async recordPageView(view: PageView) {
    this.pageViews.push(view);
  }

  async getStats(days: number, now: Date): Promise<PeriodStats> {
    const since = startOfUtcDay(new Date(now.getTime() - (days - 1) * 86_400_000));
    const views = this.pageViews.filter((v) => v.createdAt >= since);
    const byDay = new Map<string, { views: number; visitors: Set<string> }>();
    for (const v of views) {
      const day = v.createdAt.toISOString().slice(0, 10);
      const entry = byDay.get(day) ?? { views: 0, visitors: new Set() };
      entry.views += 1;
      entry.visitors.add(v.visitorHash);
      byDay.set(day, entry);
    }
    const daily = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, e]) => ({ day, views: e.views, visitors: e.visitors.size }));
    return {
      days,
      pageViews: views.length,
      uniqueVisitors: daily.reduce((sum, d) => sum + d.visitors, 0),
      topPages: top(views.map((v) => v.path)),
      topReferrers: top(views.map((v) => v.referrerHost).filter((r): r is string => !!r)),
      daily,
    };
  }

  async purge({ pageViewsBefore, rateLimitsBefore }: { pageViewsBefore: Date; rateLimitsBefore: Date }) {
    const before = this.pageViews.length;
    this.pageViews = this.pageViews.filter((v) => v.createdAt >= pageViewsBefore);
    let rateLimits = 0;
    for (const [k, v] of this.rateLimits) {
      if (v.windowStart < rateLimitsBefore) {
        this.rateLimits.delete(k);
        rateLimits++;
      }
    }
    return { pageViews: before - this.pageViews.length, rateLimits };
  }

  async close() {}
}

function top(values: string[], limit = 10): CountRow[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
