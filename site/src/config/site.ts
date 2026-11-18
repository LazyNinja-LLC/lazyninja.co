/**
 * Single source of truth for site metadata, navigation, socials, labs and the
 * two GitHub sources. The editable bits (tagline, description, LinkedIn, Labs) live in
 * src/content/settings/site.json so they can be changed at /stats → Edit site.
 *
 * Identity model:
 *  - "LazyNinja" is the brand and the company (LazyNinja LLC) → GitHub org LazyNinja-LLC.
 *  - Tyler Mummaw is the person behind it → personal GitHub account WammumTy.
 * Keep the two distinct everywhere.
 */
import { z } from 'astro/zod';
import type { GitHubSource } from '../../../shared/github/types';
import rawSettings from '../content/settings/site.json';

const LAB_STATUSES = ['live', 'beta', 'planned', 'retired'] as const;
export type LabStatus = (typeof LAB_STATUSES)[number];

const SettingsSchema = z.object({
  tagline: z.string().min(1),
  description: z.string().min(1),
  linkedin: z.string(),
  labs: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string(),
      url: z.url(),
      status: z.enum(LAB_STATUSES),
      /** Optional image path under /public, e.g. "/uploads/demo.png". Empty = none. */
      image: z.string().default(''),
    }),
  ),
});

const settings = SettingsSchema.parse(rawSettings);

export const SITE = {
  url: 'https://lazyninja.co',
  name: 'LazyNinja',
  company: 'LazyNinja LLC',
  tagline: settings.tagline,
  description: settings.description,
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
  linkedin: {
    label: 'LinkedIn',
    href: settings.linkedin,
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

export interface Lab {
  name: string;
  description: string;
  url: string;
  status: LabStatus;
  image?: string | undefined;
}

/** Labs: live demos and experiments hosted on subdomains (edited in settings/site.json). */
export const LABS: Lab[] = settings.labs.map((lab) => ({ ...lab, image: lab.image || undefined }));
