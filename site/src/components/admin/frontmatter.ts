import { parse, stringify } from 'yaml';

export type FrontMatter = Record<string, unknown>;

/** Splits a Markdown/MDX file into its YAML front matter and body. */
export function splitFrontMatter(source: string): { data: FrontMatter; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: source };
  const data = (parse(match[1] ?? '') ?? {}) as FrontMatter;
  // YAML turns unquoted dates into Date objects; the editor works with YYYY-MM-DD strings.
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Date) data[k] = v.toISOString().slice(0, 10);
  }
  return { data, body: (match[2] ?? '').replace(/^\r?\n/, '') };
}

/** Joins front matter and body back into a file. Empty optional values are dropped. */
export function joinFrontMatter(data: FrontMatter, body: string): string {
  const clean = Object.fromEntries(
    Object.entries(data).filter(
      ([, v]) => v !== '' && v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0),
    ),
  );
  return `---\n${stringify(clean, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
