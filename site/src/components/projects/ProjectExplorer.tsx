import { useEffect, useMemo, useState } from 'react';
import type { Project, ProjectStatus, SourceId } from '../../../../shared/github/types';
import ProjectCard from './ProjectCard';

export interface ProjectExplorerProps {
  projects: Project[];
  writeups: Record<string, string>;
  languages: string[];
  tags: string[];
  apiUrl: string;
}

type SourceFilter = 'all' | SourceId;
type StatusFilter = 'all' | ProjectStatus;

interface Filters {
  source: SourceFilter;
  status: StatusFilter;
  language: string;
  tag: string;
  q: string;
}

const DEFAULT_FILTERS: Filters = { source: 'all', status: 'all', language: '', tag: '', q: '' };

/** Live stats from the API. Only stars and last-updated are merged; everything else stays build-time. */
interface LiveRepo {
  key: string;
  stars: number;
  updatedAt: string | null;
}

export default function ProjectExplorer({
  projects,
  writeups,
  languages,
  tags,
  apiUrl,
}: ProjectExplorerProps) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [live, setLive] = useState<Map<string, LiveRepo>>(new Map());

  // Restore filters from the URL so filtered views are shareable.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setFilters({
      source: oneOf(params.get('source'), ['lazyninja', 'personal'], 'all'),
      status: oneOf(params.get('status'), ['shipped', 'building'], 'all'),
      language: params.get('language') ?? '',
      tag: params.get('tag') ?? '',
      q: params.get('q') ?? '',
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v && v !== 'all') params.set(k, v);
    }
    const qs = params.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }, [filters]);

  // Quietly refresh stats from the API; keep build data on any failure.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    fetch(`${apiUrl}/github/repos`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { repos?: LiveRepo[] } | null) => {
        if (!data?.repos) return;
        setLive(new Map(data.repos.map((r) => [r.key.toLowerCase(), r])));
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [apiUrl]);

  const merged = useMemo(
    () =>
      projects.map((p) => {
        const l = live.get(p.key);
        return l ? { ...p, stars: l.stars ?? p.stars, updatedAt: l.updatedAt ?? p.updatedAt } : p;
      }),
    [projects, live],
  );

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return merged.filter(
      (p) =>
        (filters.source === 'all' || p.source === filters.source) &&
        (filters.status === 'all' || p.status === filters.status) &&
        (!filters.language || p.languages.includes(filters.language)) &&
        (!filters.tag || p.tags.includes(filters.tag)) &&
        (!q ||
          [p.title, p.name, p.description, p.owner, ...p.tags, ...p.languages]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
  }, [merged, filters]);

  const counts = useMemo(
    () => ({
      all: projects.length,
      lazyninja: projects.filter((p) => p.source === 'lazyninja').length,
      personal: projects.filter((p) => p.source === 'personal').length,
    }),
    [projects],
  );

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="space-y-8">
      <div className="card space-y-5 p-5" role="search" aria-label="Filter projects">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Source">
          {(
            [
              ['all', `All (${counts.all})`],
              ['lazyninja', `LazyNinja (${counts.lazyninja})`],
              ['personal', `Personal (${counts.personal})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filters.source === value}
              onClick={() => update('source', value)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                filters.source === value
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-border text-muted hover:border-accent hover:text-accent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block space-y-1.5 lg:col-span-1">
            <span className="text-xs font-medium text-muted">Search</span>
            <input
              type="search"
              className="input !py-2"
              placeholder="Name, topic, language…"
              value={filters.q}
              onChange={(e) => update('q', e.target.value)}
            />
          </label>
          <Select
            label="Status"
            value={filters.status}
            onChange={(v) => update('status', v as StatusFilter)}
            options={[
              ['all', 'Any status'],
              ['shipped', 'Shipped'],
              ['building', 'Building'],
            ]}
          />
          <Select
            label="Language"
            value={filters.language}
            onChange={(v) => update('language', v)}
            options={[['', 'Any language'], ...languages.map((l) => [l, l] as [string, string])]}
          />
          <Select
            label="Tag"
            value={filters.tag}
            onChange={(v) => update('tag', v)}
            options={[['', 'Any tag'], ...tags.map((t) => [t, t] as [string, string])]}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 text-sm text-muted">
        <p aria-live="polite">
          Showing {visible.length} of {projects.length} projects
        </p>
        {isFiltered ? (
          <button type="button" className="link" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Clear filters
          </button>
        ) : null}
      </div>

      {visible.length > 0 ? (
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <li key={p.key}>
              <ProjectCard project={p} writeup={writeups[p.key]} headingLevel="h2" />
            </li>
          ))}
        </ul>
      ) : (
        <div className="card p-10 text-center text-muted">
          <p className="font-display text-xl text-fg">Nothing matches. The ninja is hiding.</p>
          <p className="mt-2 text-sm">Try a different filter or clear the search.</p>
        </div>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <select className="input !py-2" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function oneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T | 'all',
): T | 'all' {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
