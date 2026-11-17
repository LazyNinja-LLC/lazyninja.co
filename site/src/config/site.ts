/**
 * Single source of truth for site metadata, navigation, socials, labs and the
 * two GitHub sources.
 *
 * Identity model:
 *  - "LazyNinja" is the brand and the company (LazyNinja LLC) → GitHub org LazyNinja-LLC.
 *  - Tyler Mummaw is the person behind it → personal GitHub account WammumTy.
 * Keep the two distinct everywhere.
 */
import type { GitHubSource } from '../../../shared/github/types';

export const SITE = {
  url: 'https://lazyninja.co',
  name: 'LazyNinja',
  company: 'LazyNinja LLC',
  tagline: 'Small, sharp software, built so you can be lazy later.',
  description:
    'LazyNinja LLC builds small, sharp software: websites, AI integrations and tools that quietly do the busywork.',
  locale: 'en_US',
  /** The real person behind the brand. Use only on About, résumé, JSON-LD Person and contact. */
  person: {
    name: 'Tyler Mummaw',
    email: 'tyler@lazyninja.co',
    jobTitle: 'Founder, LazyNinja LLC',
  },
  /** API base URL. Overridable with PUBLIC_API_URL (e.g. http://localhost:3000 in dev). */
  apiUrl: apiUrl(),
} as const;

function apiUrl(): string {
  // `import.meta.env` is undefined when this file is imported by plain Node scripts.
  const env = import.meta.env as ImportMetaEnv | undefined;
  return (env?.PUBLIC_API_URL ?? (env?.DEV ? 'http://localhost:3000' : 'https://api.lazyninja.co')).replace(
    /\/+$/,
    '',
  );
}

export const NAV = [
  { href: '/projects', label: 'Projects' },
  { href: '/blog', label: 'Blog' },
  { href: '/labs', label: 'Labs' },
  { href: '/about', label: 'About' },
  { href: '/now', label: 'Now' },
  { href: '/hire', label: 'Hire' },
] as const;

export const SOCIALS = {
  githubOrg: {
    label: 'LazyNinja on GitHub',
    href: 'https://github.com/LazyNinja-LLC',
  },
  githubPersonal: {
    label: 'Tyler on GitHub',
    href: 'https://github.com/WammumTy',
  },
  // TODO(Tyler): replace with your real LinkedIn URL.
  linkedin: {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/TODO-your-handle',
    placeholder: true,
  },
  email: {
    label: 'Email',
    href: 'mailto:tyler@lazyninja.co',
  },
} as const;

export const GITHUB = {
  sources: [
    { id: 'lazyninja', type: 'org', login: 'LazyNinja-LLC', label: 'LazyNinja' },
    { id: 'personal', type: 'user', login: 'WammumTy', label: 'Personal' },
  ] satisfies GitHubSource[],
  /**
   * Repo names matching any of these (case-insensitive) are never shown.
   * Guards against school coursework. Add patterns freely.
   */
  excludePatterns: ['^(cse|stt|mth|psy|cmse|ece)[-_ ]?\\d{3}'],
  /** Repos with no status topic are "Building" if pushed within this many days. */
  buildingWindowDays: 60,
};

export type LabStatus = 'live' | 'beta' | 'planned' | 'retired';

export interface Lab {
  name: string;
  description: string;
  url: string;
  status: LabStatus;
  /** Optional image path under /public, e.g. "/labs/demo.png". */
  image?: string;
}

/** Labs: live demos and experiments hosted on subdomains. Edit freely. */
export const LABS: Lab[] = [
  {
    // TODO(Tyler): replace with a real demo, or delete.
    name: 'Demo playground (placeholder)',
    description: 'Placeholder entry. A live demo will live at demo.lazyninja.co.',
    url: 'https://demo.lazyninja.co',
    status: 'planned',
  },
  {
    // TODO(Tyler): replace with a real experiment, or delete.
    name: 'Labs sandbox (placeholder)',
    description: 'Placeholder entry. Small experiments will live at labs.lazyninja.co.',
    url: 'https://labs.lazyninja.co',
    status: 'planned',
  },
];
