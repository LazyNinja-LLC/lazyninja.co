import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import type { Project } from '../../../shared/github/types';
import { startOfUtcDay } from './memory';
import type { ContactMessage, CountRow, PageView, PeriodStats, RepoCache, Store } from './types';

/** MySQL store. Schema: deploy/schema.sql. All timestamps are stored in UTC. */
export class MySqlStore implements Store {
  readonly kind = 'mysql' as const;
  private pool: Pool;

  constructor(options: { host: string; port: number; user: string; password: string; database: string }) {
    this.pool = mysql.createPool({
      ...options,
      // Shared hosting: keep the footprint tiny.
      connectionLimit: 3,
      waitForConnections: true,
      queueLimit: 50,
      timezone: 'Z',
      charset: 'utf8mb4',
      connectTimeout: 10_000,
    });
  }

  async ping() {
    await this.pool.query('SELECT 1');
  }

  async getRepoCache(): Promise<RepoCache> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT data, synced_at FROM github_repo_cache ORDER BY sort_order ASC',
    );
    const [state] = await this.pool.query<RowDataPacket[]>(
      "SELECT updated_at FROM sync_state WHERE name = 'github_repos'",
    );
    return {
      projects: rows.map((r) => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as Project),
      syncedAt: state[0]?.updated_at ? new Date(state[0].updated_at) : null,
    };
  }

  async saveRepoCache(projects: Project[], syncedAt: Date) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM github_repo_cache');
      if (projects.length > 0) {
        await conn.query(
          'INSERT INTO github_repo_cache (repo_key, source, sort_order, data, synced_at) VALUES ?',
          [projects.map((p, i) => [p.key, p.source, i, JSON.stringify(p), syncedAt])],
        );
      }
      await conn.query(
        `INSERT INTO sync_state (name, updated_at) VALUES ('github_repos', ?)
         ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
        [syncedAt],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async saveContactMessage(m: ContactMessage) {
    const [res] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO contact_messages (created_at, name, email, reason, message, ip_hash, user_agent, mail_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [m.createdAt, m.name, m.email, m.reason, m.message, m.ipHash, m.userAgent, m.mailStatus],
    );
    return res.insertId;
  }

  async incrementRateLimit(bucket: string, keyHash: string, windowStart: Date) {
    // LAST_INSERT_ID(expr) makes the post-increment value available atomically on this connection.
    const [res] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO rate_limits (bucket, key_hash, window_start, hits) VALUES (?, ?, ?, LAST_INSERT_ID(1))
       ON DUPLICATE KEY UPDATE hits = LAST_INSERT_ID(hits + 1)`,
      [bucket, keyHash, windowStart],
    );
    if (res.insertId) return Number(res.insertId);
    // Fallback for servers that don't report LAST_INSERT_ID(expr) in the OK packet.
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT hits FROM rate_limits WHERE bucket = ? AND key_hash = ? AND window_start = ?',
      [bucket, keyHash, windowStart],
    );
    return Number(rows[0]?.hits ?? 1);
  }

  async recordPageView(v: PageView) {
    await this.pool.execute(
      `INSERT INTO page_views (created_at, day, path, referrer_host, country, visitor_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [v.createdAt, v.createdAt.toISOString().slice(0, 10), v.path, v.referrerHost, v.country, v.visitorHash],
    );
  }

  async getStats(days: number, now: Date): Promise<PeriodStats> {
    const since = startOfUtcDay(new Date(now.getTime() - (days - 1) * 86_400_000))
      .toISOString()
      .slice(0, 10);
    const [daily] = await this.pool.query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
       FROM page_views WHERE day >= ? GROUP BY day ORDER BY day`,
      [since],
    );
    const [pages] = await this.pool.query<RowDataPacket[]>(
      `SELECT path AS \`key\`, COUNT(*) AS count FROM page_views WHERE day >= ?
       GROUP BY path ORDER BY count DESC, path LIMIT 10`,
      [since],
    );
    const [refs] = await this.pool.query<RowDataPacket[]>(
      `SELECT referrer_host AS \`key\`, COUNT(*) AS count FROM page_views
       WHERE day >= ? AND referrer_host IS NOT NULL
       GROUP BY referrer_host ORDER BY count DESC, referrer_host LIMIT 10`,
      [since],
    );
    const series = daily.map((d) => ({
      day: String(d.day),
      views: Number(d.views),
      visitors: Number(d.visitors),
    }));
    const toRows = (rows: RowDataPacket[]): CountRow[] =>
      rows.map((r) => ({ key: String(r.key), count: Number(r.count) }));
    return {
      days,
      pageViews: series.reduce((s, d) => s + d.views, 0),
      uniqueVisitors: series.reduce((s, d) => s + d.visitors, 0),
      topPages: toRows(pages),
      topReferrers: toRows(refs),
      daily: series,
    };
  }

  async purge({ pageViewsBefore, rateLimitsBefore }: { pageViewsBefore: Date; rateLimitsBefore: Date }) {
    let pageViews = 0;
    // Delete in batches so a big purge never locks the table for long on shared hosting.
    for (;;) {
      const [res] = await this.pool.execute<ResultSetHeader>(
        'DELETE FROM page_views WHERE created_at < ? LIMIT 5000',
        [pageViewsBefore],
      );
      pageViews += res.affectedRows;
      if (res.affectedRows < 5000) break;
    }
    const [rl] = await this.pool.execute<ResultSetHeader>('DELETE FROM rate_limits WHERE window_start < ?', [
      rateLimitsBefore,
    ]);
    return { pageViews, rateLimits: rl.affectedRows };
  }

  async close() {
    await this.pool.end();
  }
}
