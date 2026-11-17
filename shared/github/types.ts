/**
 * Shared GitHub types used by the site build script and the API.
 * This module must stay dependency-free so both sides can import it.
 */

export type SourceId = 'lazyninja' | 'personal';
export type SourceType = 'org' | 'user';
export type ProjectStatus = 'shipped' | 'building';

export interface GitHubSource {
  id: SourceId;
  type: SourceType;
  login: string;
  label: string;
}

/** The subset of the GitHub REST "repository" object we rely on. */
export interface RawRepo {
  name: string;
  full_name: string;
  owner: { login: string };
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  fork: boolean;
  private: boolean;
  visibility?: string;
  archived: boolean;
  pushed_at: string | null;
  updated_at: string | null;
  created_at: string | null;
}

/** A normalized, filtered project ready for rendering. Keyed by `owner/name`. */
export interface Project {
  key: string;
  owner: string;
  name: string;
  source: SourceId;
  sourceLabel: string;
  title: string;
  description: string;
  url: string;
  homepage: string | null;
  topics: string[];
  /** Topics minus the `lazyninja-*` control topics. */
  tags: string[];
  status: ProjectStatus;
  featured: boolean;
  languages: string[];
  stars: number;
  forks: number;
  archived: boolean;
  pushedAt: string | null;
  updatedAt: string | null;
  image?: string | null;
}

export interface FilterOptions {
  /** Regex sources (case-insensitive) for repo names that must never be shown (e.g. coursework). */
  excludePatterns: string[];
  /** Repos pushed within this many days with no status topic default to "building". */
  buildingWindowDays: number;
  /** Reference time for status defaults; injectable for tests. */
  now?: Date;
}

export interface GitHubSnapshot {
  generatedAt: string | null;
  sources: Pick<GitHubSource, 'id' | 'login' | 'label' | 'type'>[];
  projects: Project[];
  /** Non-fatal problems encountered while fetching (e.g. rate limited languages). */
  warnings: string[];
}
