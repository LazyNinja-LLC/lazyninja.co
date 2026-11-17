import { getCollection, type CollectionEntry } from 'astro:content';

/**
 * Drafts are visible in dev and hidden in production builds.
 * Set SHOW_DRAFTS=1 to include them in a local production build (e.g. for Lighthouse runs).
 * Never set it in deploys.
 */
export const showDrafts = import.meta.env.DEV || process.env.SHOW_DRAFTS === '1';

export async function getPosts(): Promise<CollectionEntry<'blog'>[]> {
  const posts = await getCollection('blog', ({ data }) => showDrafts || !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getWriteups(): Promise<CollectionEntry<'projects'>[]> {
  return getCollection('projects', ({ data }) => showDrafts || !data.draft);
}

export function readingTime(body: string | undefined): number {
  const words = (body ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>|\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function slugifyTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
