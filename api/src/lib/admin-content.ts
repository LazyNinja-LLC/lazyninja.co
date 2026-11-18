/**
 * What the admin editor may touch in the repo, and the checks applied before committing.
 * Anything not matched here is rejected, so the write token can never be used to change
 * code, workflows or config through the API.
 */

const SLUG = '[a-z0-9][a-z0-9-]{0,80}';

/** Editable text files. */
export const TEXT_PATHS: RegExp[] = [
  new RegExp(`^site/src/content/blog/${SLUG}\\.mdx?$`),
  new RegExp(`^site/src/content/projects/${SLUG}\\.mdx?$`),
  /^site\/src\/content\/now\/now\.md$/,
  /^site\/src\/content\/settings\/(about|hire|site)\.json$/,
  /^site\/src\/content\/project-overrides\.json$/,
];

/** Files the editor may delete (posts, write-ups, uploaded images). */
export const DELETABLE_PATHS: RegExp[] = [
  new RegExp(`^site/src/content/blog/${SLUG}\\.mdx?$`),
  new RegExp(`^site/src/content/projects/${SLUG}\\.mdx?$`),
  new RegExp(`^site/src/assets/uploads/${SLUG}\\.(png|jpe?g|webp|gif|avif)$`),
  new RegExp(`^site/public/uploads/${SLUG}\\.(png|jpe?g|webp|gif|avif)$`),
];

export const CONTENT_DIRS = {
  posts: 'site/src/content/blog',
  writeups: 'site/src/content/projects',
  images: 'site/src/assets/uploads',
  publicImages: 'site/public/uploads',
} as const;

export const MAX_TEXT_BYTES = 512 * 1024;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function isEditablePath(path: string): boolean {
  return TEXT_PATHS.some((re) => re.test(path));
}

export function isDeletablePath(path: string): boolean {
  return DELETABLE_PATHS.some((re) => re.test(path));
}

/** Returns an error message, or null if the text content is acceptable for that path. */
export function validateText(path: string, content: string): string | null {
  if (Buffer.byteLength(content, 'utf8') > MAX_TEXT_BYTES) return 'File is too large (512 KB max).';
  if (path.endsWith('.json')) {
    try {
      const value: unknown = JSON.parse(content);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return 'JSON must be an object.';
    } catch (err) {
      return `Invalid JSON: ${(err as Error).message}`;
    }
    return null;
  }
  // Markdown/MDX: must start with front matter.
  if (!/^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(content)) {
    return 'Markdown must start with front matter between --- lines.';
  }
  return null;
}

export type UploadKind = 'resume' | 'image' | 'public-image';

const IMAGE_SIGNATURES: [string, (b: Buffer) => boolean][] = [
  ['png', (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['jpg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['gif', (b) => b.subarray(0, 4).toString('latin1') === 'GIF8'],
  [
    'webp',
    (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  ],
  ['avif', (b) => b.subarray(4, 12).toString('latin1').startsWith('ftypavi')],
];

export function slugifyFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'file'
  );
}

/**
 * Validates an upload by its actual bytes (never trusting the filename) and decides where
 * it goes. Returns the repo path plus how to reference it from content.
 */
export function planUpload(
  kind: UploadKind,
  filename: string,
  data: Buffer,
  now = Date.now(),
): { path: string; ref: string } | { error: string } {
  if (data.length === 0) return { error: 'The file is empty.' };
  if (data.length > MAX_UPLOAD_BYTES) return { error: 'File is too large (5 MB max).' };

  if (kind === 'resume') {
    if (data.subarray(0, 5).toString('latin1') !== '%PDF-') return { error: 'The résumé must be a PDF.' };
    return { path: 'site/public/resume.pdf', ref: '/resume.pdf' };
  }

  const ext = IMAGE_SIGNATURES.find(([, test]) => test(data))?.[0];
  if (!ext) return { error: 'Images must be PNG, JPEG, WebP, GIF or AVIF.' };
  // A short timestamp suffix avoids overwriting an older image with the same name.
  const name = `${slugifyFilename(filename)}-${now.toString(36)}.${ext}`;
  if (kind === 'image') {
    // Optimized by Astro; referenced relative to a post/write-up file.
    return { path: `${CONTENT_DIRS.images}/${name}`, ref: `../../assets/uploads/${name}` };
  }
  // Served as-is from /uploads (e.g. Labs images).
  return { path: `${CONTENT_DIRS.publicImages}/${name}`, ref: `/uploads/${name}` };
}
