import { fetchGitHubSnapshot } from '../../../shared/github/fetch';
import { DEFAULT_FILTER_OPTIONS } from '../../../shared/github/filter';
import type { Project } from '../../../shared/github/types';
import type { Config } from '../config';
import type { RepoCache, Store } from '../store/types';

/** Default; production uses GITHUB_CACHE_MINUTES (60 unless set). */
export const CACHE_MAX_AGE_MS = 60 * 60 * 1000;
const FAILURE_BACKOFF_MS = 10 * 60 * 1000;

export type ProjectFetcher = () => Promise<Project[]>;

export function githubFetcher(config: Config): ProjectFetcher {
  return async () => {
    const snapshot = await fetchGitHubSnapshot(config.github.sources, {
      token: config.github.token,
      filter: { ...DEFAULT_FILTER_OPTIONS, excludePatterns: config.github.excludePatterns },
      maxRateLimitWaitSeconds: 0,
      userAgent: 'lazyninja.co-api',
    });
    for (const w of snapshot.warnings) console.warn(`[github] ${w}`);
    return snapshot.projects;
  };
}

/**
 * Serves repos from the MySQL cache. Never calls GitHub per request: only when
 * the cache is older than GITHUB_CACHE_MINUTES (or empty), deduplicated, with a backoff after
 * failures. A stale cache is served immediately while it refreshes.
 */
export class GitHubCache {
  private inflight: Promise<RepoCache> | null = null;
  private lastFailure = 0;

  constructor(
    private readonly store: Store,
    private readonly fetcher: ProjectFetcher,
    private readonly options: { maxAgeMs?: number; now?: () => number } = {},
  ) {}

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  isStale(cache: RepoCache): boolean {
    if (!cache.syncedAt) return true;
    return this.now() - cache.syncedAt.getTime() > (this.options.maxAgeMs ?? CACHE_MAX_AGE_MS);
  }

  async get(): Promise<RepoCache & { stale: boolean }> {
    const cache = await this.store.getRepoCache();
    if (!this.isStale(cache)) return { ...cache, stale: false };

    const canRetry = this.now() - this.lastFailure > FAILURE_BACKOFF_MS;
    if (!canRetry) return { ...cache, stale: true };

    if (cache.projects.length === 0) {
      try {
        return { ...(await this.refresh()), stale: false };
      } catch {
        return { ...cache, stale: true };
      }
    }
    this.refresh().catch(() => {});
    return { ...cache, stale: true };
  }

  /** Fetches from GitHub and writes the cache. Concurrent callers share one request. */
  refresh(): Promise<RepoCache> {
    this.inflight ??= (async () => {
      try {
        const projects = await this.fetcher();
        const syncedAt = new Date(this.now());
        await this.store.saveRepoCache(projects, syncedAt);
        return { projects, syncedAt };
      } catch (err) {
        this.lastFailure = this.now();
        console.error(`[github] refresh failed: ${(err as Error).message}`);
        throw err;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
}
