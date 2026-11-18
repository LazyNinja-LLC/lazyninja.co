import { buildProjects, DEFAULT_FILTER_OPTIONS, shouldInclude } from './filter';
import type { FilterOptions, GitHubSnapshot, GitHubSource, RawRepo } from './types';

export interface FetchOptions {
  token?: string | undefined;
  filter?: FilterOptions | undefined;
  /** Injectable for tests. Defaults to global fetch (Node 18+). */
  fetchImpl?: typeof fetch | undefined;
  /** Max seconds we are willing to wait for a rate-limit reset before giving up. */
  maxRateLimitWaitSeconds?: number | undefined;
  userAgent?: string | undefined;
  log?: ((message: string) => void) | undefined;
}

const API = 'https://api.github.com';

export class RateLimitError extends Error {
  constructor(
    message: string,
    readonly resetAt: Date | null,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Fetches public repos for every source, filters them with the shared rules and
 * returns a snapshot. Languages are best-effort: if we hit the rate limit while
 * fetching them, projects keep their primary language and a warning is recorded.
 */
export async function fetchGitHubSnapshot(
  sources: GitHubSource[],
  options: FetchOptions = {},
): Promise<GitHubSnapshot> {
  const filter = options.filter ?? DEFAULT_FILTER_OPTIONS;
  const warnings: string[] = [];
  const client = createClient(options);

  const results = [];
  for (const source of sources) {
    const repos = await client.listRepos(source);
    const visible = repos.filter((r) => shouldInclude(r, filter));
    const languages: Record<string, string[]> = {};
    let languagesBlocked = false;
    await mapLimit(visible, 4, async (repo) => {
      if (languagesBlocked) return;
      try {
        languages[repo.full_name] = await client.topLanguages(repo.full_name);
      } catch (err) {
        if (err instanceof RateLimitError) {
          languagesBlocked = true;
          warnings.push(
            `Rate limited while fetching languages for ${source.login}; using primary language only.`,
          );
        } else {
          warnings.push(`Languages for ${repo.full_name}: ${(err as Error).message}`);
        }
      }
    });
    results.push({ source, repos, languages });
  }

  return {
    generatedAt: new Date().toISOString(),
    sources: sources.map(({ id, login, label, type }) => ({ id, login, label, type })),
    projects: buildProjects(results, filter),
    warnings,
  };
}

function createClient(options: FetchOptions) {
  const doFetch = options.fetchImpl ?? fetch;
  const maxWait = options.maxRateLimitWaitSeconds ?? 60;
  const log = options.log ?? (() => {});
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': options.userAgent ?? 'lazyninja.co-sync',
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  async function request<T>(url: string, attempt = 0): Promise<{ data: T; res: Response }> {
    const res = await doFetch(url, { headers });
    if (res.ok) return { data: (await res.json()) as T, res };

    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    const retryAfter = Number(res.headers.get('retry-after'));
    const isRateLimited = res.status === 429 || (res.status === 403 && remaining === '0');

    if (isRateLimited || (res.status === 403 && retryAfter)) {
      const waitSeconds = retryAfter
        ? retryAfter
        : reset
          ? Math.max(0, reset - Math.floor(Date.now() / 1000)) + 1
          : Infinity;
      if (attempt < 2 && waitSeconds <= maxWait) {
        log(`GitHub rate limit hit; waiting ${waitSeconds}s before retrying ${url}`);
        await sleep(waitSeconds * 1000);
        return request<T>(url, attempt + 1);
      }
      throw new RateLimitError(
        `GitHub rate limit exceeded for ${url}`,
        reset ? new Date(reset * 1000) : null,
      );
    }
    if (res.status >= 500 && attempt < 2) {
      await sleep(500 * 2 ** attempt);
      return request<T>(url, attempt + 1);
    }
    // Include GitHub's own explanation (e.g. org token policies on 403s); it never contains the token.
    const reason = await res
      .json()
      .then((body: unknown) => {
        const message = (body as { message?: unknown } | null)?.message;
        return typeof message === 'string' ? `: ${message}` : '';
      })
      .catch(() => '');
    throw new Error(`GitHub ${res.status} for ${url}${reason}`);
  }

  return {
    async listRepos(source: GitHubSource): Promise<RawRepo[]> {
      const base =
        source.type === 'org'
          ? `${API}/orgs/${encodeURIComponent(source.login)}/repos?type=public`
          : `${API}/users/${encodeURIComponent(source.login)}/repos?type=owner`;
      const all: RawRepo[] = [];
      for (let page = 1; page <= 10; page++) {
        const { data } = await request<RawRepo[]>(`${base}&per_page=100&page=${page}&sort=pushed`);
        all.push(...data);
        if (data.length < 100) break;
      }
      return all;
    },
    async topLanguages(fullName: string): Promise<string[]> {
      const { data } = await request<Record<string, number>>(`${API}/repos/${fullName}/languages`);
      return Object.entries(data)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([lang]) => lang);
    },
  };
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
