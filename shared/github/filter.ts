import type { FilterOptions, GitHubSource, Project, ProjectStatus, RawRepo, SourceId } from './types';

/** Repo topics that control how a repo appears on the site. */
export const TOPICS = {
  shipped: 'lazyninja-shipped',
  building: 'lazyninja-building',
  featured: 'lazyninja-featured',
  hide: 'lazyninja-hide',
} as const;

/** Default coursework guard: course-code-looking repo names are never shown. */
export const DEFAULT_EXCLUDE_PATTERNS = ['^(cse|stt|mth|psy|cmse|ece)[-_ ]?\\d{3}'];

export const DEFAULT_FILTER_OPTIONS: FilterOptions = {
  excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
  buildingWindowDays: 60,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export type ExclusionReason =
  'fork' | 'private' | 'profile-readme' | 'hidden-topic' | 'excluded-pattern' | null;

/** Returns why a repo must be excluded, or `null` when it may be shown. */
export function exclusionReason(
  repo: RawRepo,
  options: Pick<FilterOptions, 'excludePatterns'> = DEFAULT_FILTER_OPTIONS,
): ExclusionReason {
  if (repo.fork) return 'fork';
  if (repo.private || (repo.visibility && repo.visibility !== 'public')) return 'private';
  const name = repo.name.toLowerCase();
  const owner = repo.owner.login.toLowerCase();
  // Profile README repos: `<user>/<user>` and the org-level `.github` repo.
  if (name === owner || name === '.github') return 'profile-readme';
  if ((repo.topics ?? []).includes(TOPICS.hide)) return 'hidden-topic';
  if (compilePatterns(options.excludePatterns).some((re) => re.test(repo.name))) {
    return 'excluded-pattern';
  }
  return null;
}

export function shouldInclude(repo: RawRepo, options?: Pick<FilterOptions, 'excludePatterns'>) {
  return exclusionReason(repo, options) === null;
}

const patternCache = new Map<string, RegExp>();
function compilePatterns(patterns: string[]): RegExp[] {
  return patterns.map((p) => {
    let re = patternCache.get(p);
    if (!re) {
      re = new RegExp(p, 'i');
      patternCache.set(p, re);
    }
    return re;
  });
}

/** Status from topics, falling back to recency of the last push. */
export function deriveStatus(
  repo: Pick<RawRepo, 'topics' | 'pushed_at'>,
  options: Pick<FilterOptions, 'buildingWindowDays' | 'now'> = DEFAULT_FILTER_OPTIONS,
): ProjectStatus {
  const topics = repo.topics ?? [];
  if (topics.includes(TOPICS.shipped)) return 'shipped';
  if (topics.includes(TOPICS.building)) return 'building';
  const now = (options.now ?? new Date()).getTime();
  const pushed = repo.pushed_at ? Date.parse(repo.pushed_at) : NaN;
  if (Number.isFinite(pushed) && now - pushed <= options.buildingWindowDays * DAY_MS) {
    return 'building';
  }
  return 'shipped';
}

export function repoKey(owner: string, name: string) {
  return `${owner}/${name}`.toLowerCase();
}

/** Derives the source from a `owner/name` string using the configured sources. */
export function sourceForOwner(owner: string, sources: GitHubSource[]): GitHubSource | undefined {
  return sources.find((s) => s.login.toLowerCase() === owner.toLowerCase());
}

export function normalizeRepo(
  repo: RawRepo,
  source: GitHubSource,
  languages: string[] = [],
  options: Pick<FilterOptions, 'buildingWindowDays' | 'now'> = DEFAULT_FILTER_OPTIONS,
): Project {
  const topics = repo.topics ?? [];
  const langs = uniq([...(repo.language ? [repo.language] : []), ...languages]).slice(0, 3);
  return {
    key: repoKey(repo.owner.login, repo.name),
    owner: repo.owner.login,
    name: repo.name,
    source: source.id,
    sourceLabel: source.label,
    title: repo.name,
    description: repo.description ?? '',
    url: repo.html_url,
    homepage: repo.homepage ? repo.homepage : null,
    topics,
    tags: topics.filter((t) => !t.startsWith('lazyninja-')),
    status: deriveStatus(repo, options),
    featured: topics.includes(TOPICS.featured),
    languages: langs,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    archived: repo.archived,
    pushedAt: repo.pushed_at,
    updatedAt: repo.pushed_at ?? repo.updated_at,
  };
}

const SOURCE_ORDER: Record<SourceId, number> = { lazyninja: 0, personal: 1 };

/** Default order: LazyNinja first, then featured, then most recently pushed. */
export function compareProjects(a: Project, b: Project): number {
  return (
    SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] ||
    Number(b.featured) - Number(a.featured) ||
    (Date.parse(b.updatedAt ?? '') || 0) - (Date.parse(a.updatedAt ?? '') || 0) ||
    a.key.localeCompare(b.key)
  );
}

export function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort(compareProjects);
}

/**
 * Filters + normalizes raw repos from one source. Duplicate names across
 * sources are fine because projects are keyed by `owner/name`.
 */
export function buildProjects(
  reposBySource: { source: GitHubSource; repos: RawRepo[]; languages?: Record<string, string[]> }[],
  options: FilterOptions = DEFAULT_FILTER_OPTIONS,
): Project[] {
  const byKey = new Map<string, Project>();
  for (const { source, repos, languages = {} } of reposBySource) {
    for (const repo of repos) {
      if (!shouldInclude(repo, options)) continue;
      const project = normalizeRepo(repo, source, languages[repo.full_name] ?? [], options);
      byKey.set(project.key, project);
    }
  }
  return sortProjects([...byKey.values()]);
}

export interface ProjectOverride {
  title?: string;
  description?: string;
  image?: string;
  demo?: string;
  tags?: string[];
  /** Site only: Hangul glyph on the project's home-page scroll. Not applied to the project data. */
  glyph?: string;
}

/** Applies `project-overrides.json` entries (keyed by `owner/name`, case-insensitive). */
export function applyOverrides(projects: Project[], overrides: Record<string, ProjectOverride>): Project[] {
  const normalized = new Map(Object.entries(overrides).map(([k, v]) => [k.toLowerCase(), v]));
  return projects.map((p) => {
    const o = normalized.get(p.key);
    if (!o) return p;
    return {
      ...p,
      // Empty values mean "not overridden" (the admin form saves blank fields as "").
      title: o.title || p.title,
      description: o.description || p.description,
      image: o.image || p.image || null,
      homepage: o.demo || p.homepage,
      tags: o.tags?.length ? o.tags : p.tags,
    };
  });
}

/** Parses `GITHUB_SOURCES` env format: `org:LazyNinja-LLC,user:WammumTy`. */
export function parseSourcesEnv(value: string | undefined): GitHubSource[] {
  const defaults: GitHubSource[] = [
    { id: 'lazyninja', type: 'org', login: 'LazyNinja-LLC', label: 'LazyNinja' },
    { id: 'personal', type: 'user', login: 'WammumTy', label: 'Personal' },
  ];
  if (!value?.trim()) return defaults;
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [type, login] = part.split(':').map((s) => s.trim());
      if ((type !== 'org' && type !== 'user') || !login) {
        throw new Error(`Invalid GITHUB_SOURCES entry "${part}" (expected org:<login> or user:<login>)`);
      }
      // The org source is the LazyNinja brand; the user source is Tyler's personal account.
      return type === 'org'
        ? { id: 'lazyninja', type, login, label: 'LazyNinja' }
        : { id: 'personal', type, login, label: 'Personal' };
    });
}

function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}
