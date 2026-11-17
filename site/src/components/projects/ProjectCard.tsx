import type { Project } from '../../../../shared/github/types';

export interface ProjectCardProps {
  project: Project;
  /** Path to an MDX write-up, if one exists. */
  writeup?: string | undefined;
  headingLevel?: 'h2' | 'h3';
}

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function formatUpdated(iso: string | null): string {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  return Number.isNaN(d.valueOf()) ? 'unknown' : dateFmt.format(d);
}

/**
 * Rendered statically on Home (no JS) and inside the Projects island.
 * Source badge: solid vermilion for LazyNinja, dashed blue for Personal.
 */
export default function ProjectCard({ project, writeup, headingLevel = 'h3' }: ProjectCardProps) {
  const Heading = headingLevel;
  const isLazyNinja = project.source === 'lazyninja';
  return (
    <article
      className={`card group relative flex h-full flex-col gap-4 p-6 transition-[border-color,transform] duration-300 hover:border-accent/60 motion-safe:hover:-translate-y-1 ${
        isLazyNinja ? '' : 'border-dashed'
      }`}
      data-project={project.key}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={isLazyNinja ? 'badge-lazyninja' : 'badge-personal'}
          title={
            isLazyNinja
              ? 'LazyNinja LLC project (GitHub: LazyNinja-LLC)'
              : "Tyler's personal project (GitHub: WammumTy)"
          }
        >
          {isLazyNinja ? (
            <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden="true">
              <path d="M6 0l1.6 4.4L12 6 7.6 7.6 6 12 4.4 7.6 0 6l4.4-1.6z" fill="currentColor" />
            </svg>
          ) : null}
          {project.sourceLabel}
        </span>
        <span className={project.status === 'shipped' ? 'badge-shipped' : 'badge-building'}>
          <span aria-hidden="true">{project.status === 'shipped' ? '●' : '◐'}</span>
          {project.status === 'shipped' ? 'Shipped' : 'Building'}
        </span>
        {project.featured ? <span className="sr-only">Featured</span> : null}
      </div>

      <div className="space-y-2">
        <Heading className="font-display text-xl font-bold">
          <a
            href={writeup ?? project.url}
            className="after:absolute after:inset-0 after:rounded-[var(--radius-card)] focus-visible:outline-none group-focus-within:text-accent"
            {...(writeup ? {} : { rel: 'noopener' })}
          >
            {project.title}
          </a>
        </Heading>
        <p className="font-mono text-xs text-muted">
          {project.owner}/{project.name}
        </p>
        <p className="text-sm leading-relaxed text-muted">{project.description || 'No description yet.'}</p>
      </div>

      {project.languages.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Languages">
          {project.languages.map((lang) => (
            <li key={lang} className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-fg/90">
              {lang}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted">
        <span className="flex items-center gap-3">
          <span title="GitHub stars">
            <span aria-hidden="true">★</span> <span data-stat="stars">{project.stars}</span>
            <span className="sr-only"> stars</span>
          </span>
          <span>
            Updated{' '}
            <time data-stat="updated" dateTime={project.updatedAt ?? undefined}>
              {formatUpdated(project.updatedAt)}
            </time>
          </span>
        </span>
        <span className="relative z-10 flex gap-3">
          <a href={project.url} className="link" rel="noopener">
            Repo<span className="sr-only"> for {project.title}</span>
          </a>
          {project.homepage ? (
            <a href={project.homepage} className="link" rel="noopener">
              Live demo<span className="sr-only"> of {project.title}</span>
            </a>
          ) : null}
          {writeup ? (
            <a href={writeup} className="link">
              Write-up<span className="sr-only"> about {project.title}</span>
            </a>
          ) : null}
        </span>
      </div>
    </article>
  );
}
