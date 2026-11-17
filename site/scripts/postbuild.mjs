/**
 * Post-build steps for dist/:
 *  1. CSP: hash every inline <script> in the built HTML and write the hashes
 *     into dist/.htaccess (replacing __CSP_SCRIPT_HASHES__), so script-src never
 *     needs 'unsafe-inline'.
 *  2. sitemap.xml: @astrojs/sitemap writes sitemap-index.xml; robots.txt and the
 *     spec point at /sitemap.xml, so publish the index under that name too.
 */
import { createHash } from 'node:crypto';
import { copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith('.html')) yield path;
  }
}

const hashes = new Set();
let pages = 0;
const SCRIPT_RE = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
for await (const file of htmlFiles(dist)) {
  pages++;
  const html = await readFile(file, 'utf8');
  for (const [, attrs = '', body] of html.matchAll(SCRIPT_RE)) {
    if (/\ssrc\s*=/.test(attrs)) continue;
    const type = attrs.match(/\stype\s*=\s*["']?([^"'\s>]+)/i)?.[1];
    // JSON-LD and other data blocks are not executed, so CSP doesn't apply.
    if (type && !/^(module|text\/javascript|application\/javascript)$/i.test(type)) continue;
    if (!body.trim()) continue;
    hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
}

const htaccessPath = join(dist, '.htaccess');
const htaccess = await readFile(htaccessPath, 'utf8');
const placeholder = "script-src 'self' __CSP_SCRIPT_HASHES__";
if (!htaccess.includes(placeholder)) {
  throw new Error(`dist/.htaccess is missing the CSP placeholder: ${placeholder}`);
}
await writeFile(
  htaccessPath,
  htaccess.replace(placeholder, `script-src 'self' ${[...hashes].sort().join(' ')}`),
);
console.log(`[postbuild] CSP: ${hashes.size} inline script hash(es) from ${pages} pages`);

await copyFile(join(dist, 'sitemap-index.xml'), join(dist, 'sitemap.xml'));
console.log('[postbuild] sitemap.xml written');
