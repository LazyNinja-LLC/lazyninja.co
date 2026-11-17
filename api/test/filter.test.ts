import { describe, expect, it } from 'vitest';
import {
  applyOverrides,
  buildProjects,
  deriveStatus,
  exclusionReason,
  parseSourcesEnv,
  sortProjects,
} from '../../shared/github/filter';
import type { GitHubSource, RawRepo } from '../../shared/github/types';

const ORG: GitHubSource = { id: 'lazyninja', type: 'org', login: 'LazyNinja-LLC', label: 'LazyNinja' };
const USER: GitHubSource = { id: 'personal', type: 'user', login: 'WammumTy', label: 'Personal' };
const NOW = new Date('2026-11-17T00:00:00Z');
const OPTS = {
  excludePatterns: ['^(cse|stt|mth|psy|cmse|ece)[-_ ]?\\d{3}'],
  buildingWindowDays: 60,
  now: NOW,
};

function repo({
  owner = 'WammumTy',
  ...overrides
}: Partial<Omit<RawRepo, 'owner'>> & { name: string; owner?: string }): RawRepo {
  return {
    full_name: `${owner}/${overrides.name}`,
    owner: { login: owner },
    description: null,
    html_url: `https://github.com/${owner}/${overrides.name}`,
    homepage: null,
    language: 'TypeScript',
    topics: [],
    stargazers_count: 0,
    forks_count: 0,
    fork: false,
    private: false,
    visibility: 'public',
    archived: false,
    pushed_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('exclusionReason', () => {
  it('excludes forks, private repos and profile READMEs', () => {
    expect(exclusionReason(repo({ name: 'x', fork: true }), OPTS)).toBe('fork');
    expect(exclusionReason(repo({ name: 'x', private: true }), OPTS)).toBe('private');
    expect(exclusionReason(repo({ name: 'x', visibility: 'internal' }), OPTS)).toBe('private');
    expect(exclusionReason(repo({ name: 'WammumTy' }), OPTS)).toBe('profile-readme');
    expect(exclusionReason(repo({ name: '.github', owner: 'LazyNinja-LLC' }), OPTS)).toBe('profile-readme');
  });

  it('excludes the lazyninja-hide topic', () => {
    expect(exclusionReason(repo({ name: 'x', topics: ['lazyninja-hide'] }), OPTS)).toBe('hidden-topic');
  });

  it('excludes course-code repo names (coursework guard)', () => {
    for (const name of ['CSE-231', 'cse231', 'stt_380', 'MTH 132', 'cmse202-project', 'ece-201', 'PSY101']) {
      expect(exclusionReason(repo({ name }), OPTS), name).toBe('excluded-pattern');
    }
  });

  it('keeps ordinary repos and respects custom patterns', () => {
    expect(exclusionReason(repo({ name: 'lazyninja.co' }), OPTS)).toBeNull();
    expect(exclusionReason(repo({ name: 'csexample' }), OPTS)).toBeNull();
    expect(exclusionReason(repo({ name: 'secret-thing' }), { excludePatterns: ['^secret'] })).toBe(
      'excluded-pattern',
    );
  });
});

describe('deriveStatus', () => {
  it('uses status topics first', () => {
    expect(deriveStatus({ topics: ['lazyninja-shipped'], pushed_at: '2026-11-16T00:00:00Z' }, OPTS)).toBe(
      'shipped',
    );
    expect(deriveStatus({ topics: ['lazyninja-building'], pushed_at: '2020-01-01T00:00:00Z' }, OPTS)).toBe(
      'building',
    );
  });

  it('defaults by recency: pushed within 60 days is building, else shipped', () => {
    expect(deriveStatus({ topics: [], pushed_at: '2026-10-01T00:00:00Z' }, OPTS)).toBe('building');
    expect(deriveStatus({ topics: [], pushed_at: '2026-08-01T00:00:00Z' }, OPTS)).toBe('shipped');
    expect(deriveStatus({ topics: [], pushed_at: null }, OPTS)).toBe('shipped');
  });
});

describe('buildProjects', () => {
  const projects = buildProjects(
    [
      {
        source: ORG,
        repos: [
          repo({ name: 'site', owner: 'LazyNinja-LLC', pushed_at: '2026-01-01T00:00:00Z' }),
          repo({ name: 'tool', owner: 'LazyNinja-LLC', topics: ['lazyninja-featured', 'cli'] }),
        ],
        languages: { 'LazyNinja-LLC/tool': ['TypeScript', 'Shell', 'CSS', 'HTML'] },
      },
      {
        source: USER,
        repos: [
          repo({ name: 'site', pushed_at: '2026-11-10T00:00:00Z' }),
          repo({ name: 'cse231', pushed_at: '2026-11-10T00:00:00Z' }),
          repo({ name: 'forked', fork: true }),
        ],
      },
    ],
    OPTS,
  );

  it('keeps same-named repos from both accounts, keyed by owner/name', () => {
    expect(projects.map((p) => p.key)).toEqual(['lazyninja-llc/tool', 'lazyninja-llc/site', 'wammumty/site']);
  });

  it('tags each project with its source', () => {
    expect(projects.map((p) => p.source)).toEqual(['lazyninja', 'lazyninja', 'personal']);
    expect(projects[2]!.sourceLabel).toBe('Personal');
  });

  it('marks featured, strips control topics from tags and caps languages at 3', () => {
    const tool = projects[0]!;
    expect(tool.featured).toBe(true);
    expect(tool.tags).toEqual(['cli']);
    expect(tool.languages).toEqual(['TypeScript', 'Shell', 'CSS']);
  });

  it('sorts LazyNinja first, then featured, then most recent', () => {
    const shuffled = [...projects].reverse();
    expect(sortProjects(shuffled).map((p) => p.key)).toEqual(projects.map((p) => p.key));
  });
});

describe('applyOverrides', () => {
  it('overrides by owner/name, case-insensitively', () => {
    const [p] = buildProjects(
      [{ source: ORG, repos: [repo({ name: 'site', owner: 'LazyNinja-LLC' })] }],
      OPTS,
    );
    const [o] = applyOverrides([p!], { 'LazyNinja-LLC/Site': { title: 'The Site', demo: 'https://x.dev' } });
    expect(o!.title).toBe('The Site');
    expect(o!.homepage).toBe('https://x.dev');
  });
});

describe('parseSourcesEnv', () => {
  it('parses org/user pairs and maps them to the brand vs personal sources', () => {
    expect(parseSourcesEnv('org:LazyNinja-LLC,user:WammumTy')).toEqual([ORG, USER]);
    expect(parseSourcesEnv(undefined)).toEqual([ORG, USER]);
    expect(() => parseSourcesEnv('team:foo')).toThrow();
  });
});
