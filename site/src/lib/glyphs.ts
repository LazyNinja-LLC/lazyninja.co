/**
 * Korean (Hangul) brush glyphs shown on home-page journal tiles and project scrolls.
 * A nod to Tyler's taekwondo background. Each can be set explicitly:
 *  - posts: `glyph:` in the front matter
 *  - projects: `"glyph"` in src/content/project-overrides.json
 * Otherwise one is picked from tags / repo names below.
 */
import type { Project } from '../../../shared/github/types';
import { overrides } from './projects';

const POST_TAGS: [RegExp, string][] = [
  [/^(ai|llm|ml|gpt|chatbots?|machine-learning|agents?)$/i, '지능'], // intelligence
  [/^(web|astro|css|html|frontend|javascript|typescript|react|performance)$/i, '웹'], // web
  [/^(tools?|automation|cli|scripts?|productivity)$/i, '도구'], // tools
  [/^(meta|news|announcements?|intro)$/i, '시작'], // beginning
  [/^(design|ux|ui)$/i, '멋'], // style
  [/^(taekwondo|martial-arts|training)$/i, '도'], // the way
];

/** Glyph for a journal tile: front matter first, then the first matching tag, else 글 ("writing"). */
export function postGlyph(data: { glyph?: string | undefined; tags: string[] }): string {
  if (data.glyph?.trim()) return data.glyph.trim();
  for (const tag of data.tags) {
    const hit = POST_TAGS.find(([re]) => re.test(tag));
    if (hit) return hit[1];
  }
  return '글';
}

const PROJECT_WORDS: [RegExp, string][] = [
  [/\b(ai|llm|gpt|ml|chat)|ai\b/i, '지능'], // intelligence
  [/bot|trad|market|stock|crypto/i, '시장'], // market
  [/hack|club|contest|jam/i, '대회'], // competition
  [/site|web|\.co\b|\.com\b|portfolio/i, '웹'], // web
  [/tool|cli|script|util/i, '도구'], // tools
];

/** Glyph for a project scroll: override first, then repo name/topics, else 도장 (LazyNinja) / 작품 (personal). */
export function projectGlyph(project: Project): string {
  const override = Object.entries(overrides).find(([k]) => k.toLowerCase() === project.key)?.[1];
  if (override?.glyph?.trim()) return override.glyph.trim();
  const haystack = [project.name, ...project.topics].join(' ');
  const hit = PROJECT_WORDS.find(([re]) => re.test(haystack));
  if (hit) return hit[1];
  return project.source === 'lazyninja' ? '도장' : '작품';
}
