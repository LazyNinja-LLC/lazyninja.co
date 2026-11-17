/**
 * About page content. Everything marked TODO(Tyler) is a placeholder. Replace it
 * with real details; nothing here should be invented.
 */

// TODO(Tyler): write your bio. Keep the person (Tyler Mummaw) distinct from the brand (LazyNinja).
export const bio = [
  "Hi, I'm Tyler Mummaw, the person behind LazyNinja. (Placeholder bio: replace this paragraph in src/data/about.ts.)",
  'Placeholder: a sentence or two about what you build, what you care about, and how you like to work.',
];

export interface SkillGroup {
  title: string;
  items: string[];
  placeholder?: boolean;
}

/**
 * Skills/tools grid. The "Languages on GitHub" group is generated from public repos
 * at build time (see about.astro). Add your own groups below.
 */
export const skillGroups: SkillGroup[] = [
  // TODO(Tyler): replace with the tools you actually use.
  { title: 'Frameworks (placeholder)', items: ['TODO: framework', 'TODO: framework'], placeholder: true },
  { title: 'Tools (placeholder)', items: ['TODO: tool', 'TODO: tool'], placeholder: true },
  { title: 'AI & data (placeholder)', items: ['TODO: library or service'], placeholder: true },
];

export interface TimelineItem {
  when: string;
  title: string;
  text: string;
  placeholder?: boolean;
}

// TODO(Tyler): real milestones, newest first. No school coursework.
export const timeline: TimelineItem[] = [
  {
    when: 'Now',
    title: 'Building LazyNinja LLC',
    text: 'Websites, AI integrations and small tools under the LazyNinja brand.',
  },
  {
    when: '20XX',
    title: 'TODO(Tyler): milestone',
    text: 'Placeholder: what happened and why it mattered.',
    placeholder: true,
  },
  {
    when: '20XX',
    title: 'TODO(Tyler): milestone',
    text: 'Placeholder: what happened and why it mattered.',
    placeholder: true,
  },
];
