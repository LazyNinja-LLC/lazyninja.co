import githubData from '../data/github.json';
import overridesJson from '../content/project-overrides.json';
import { applyOverrides, repoKey, sortProjects, type ProjectOverride } from '../../../shared/github/filter';
import type { GitHubSnapshot, Project, SourceId } from '../../../shared/github/types';
import { GITHUB } from '../config/site';

const snapshot = githubData as GitHubSnapshot;
const overrides = Object.fromEntries(
  Object.entries(overridesJson as Record<string, unknown>).filter(([k]) => !k.startsWith('$')),
) as Record<string, ProjectOverride>;

/** All visible projects (both sources), with overrides applied, LazyNinja first. */
export const projects: Project[] = sortProjects(applyOverrides(snapshot.projects, overrides));
export const generatedAt = snapshot.generatedAt;

export function projectsBySource(source: SourceId): Project[] {
  return projects.filter((p) => p.source === source);
}

/** Featured first, then most recent, up to `limit`, for one source. */
export function featuredFor(source: SourceId, limit = 3): Project[] {
  const list = projectsBySource(source);
  const featured = list.filter((p) => p.featured);
  const rest = list.filter((p) => !p.featured && !p.archived);
  return [...featured, ...rest].slice(0, limit);
}

export function findProject(repo: string): Project | undefined {
  const [owner = '', name = ''] = repo.split('/');
  return projects.find((p) => p.key === repoKey(owner, name));
}

/** Derives the source from a write-up's `repo: "Owner/name"` front matter. */
export function sourceForRepo(repo: string): (typeof GITHUB.sources)[number] | undefined {
  const owner = repo.split('/')[0]?.toLowerCase();
  return GITHUB.sources.find((s) => s.login.toLowerCase() === owner);
}

export function allLanguages(): string[] {
  return [...new Set(projects.flatMap((p) => p.languages))].sort();
}

export function allTags(): string[] {
  return [...new Set(projects.flatMap((p) => p.tags))].sort();
}
