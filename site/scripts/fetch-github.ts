/**
 * Build-time GitHub sync → src/data/github.json.
 *
 *   npm run github            fetch from GitHub (uses GITHUB_TOKEN if set)
 *   npm run github:ensure     only create an empty snapshot if none exists
 *
 * Failure handling: if GitHub is unreachable we keep the previous snapshot (or
 * write an empty one) so the site still builds. Set GITHUB_FETCH_STRICT=1 to
 * fail instead. Deploys do this so a GitHub outage never ships an empty
 * Projects page.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchGitHubSnapshot } from '../../shared/github/fetch';
import type { GitHubSnapshot } from '../../shared/github/types';
import { GITHUB } from '../src/config/site';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../src/data/github.json');

loadDotEnv(resolve(here, '../.env'));
loadDotEnv(resolve(here, '../../.env'));

const ensureOnly = process.argv.includes('--ensure');
const strict = process.env.GITHUB_FETCH_STRICT === '1';

const empty: GitHubSnapshot = {
  generatedAt: null,
  sources: GITHUB.sources.map(({ id, login, label, type }) => ({ id, login, label, type })),
  projects: [],
  warnings: ['No GitHub data yet. Run `npm run github` in /site.'],
};

async function write(snapshot: GitHubSnapshot) {
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(snapshot, null, 2)}\n`);
}

async function main() {
  if (ensureOnly) {
    if (!existsSync(out)) {
      await write(empty);
      console.log('[github] wrote empty snapshot (run `npm run github` to fetch real data)');
    }
    return;
  }

  const token = process.env.GITHUB_TOKEN || undefined;
  console.log(
    `[github] fetching ${GITHUB.sources.map((s) => `${s.type}:${s.login}`).join(', ')}${token ? ' (authenticated)' : ' (unauthenticated: 60 req/h limit)'}`,
  );
  try {
    const snapshot = await fetchGitHubSnapshot(GITHUB.sources, {
      token,
      filter: {
        excludePatterns: GITHUB.excludePatterns,
        buildingWindowDays: GITHUB.buildingWindowDays,
      },
      log: (m) => console.log(`[github] ${m}`),
    });
    await write(snapshot);
    for (const w of snapshot.warnings) console.warn(`[github] warning: ${w}`);
    const counts = GITHUB.sources
      .map((s) => `${s.label}: ${snapshot.projects.filter((p) => p.source === s.id).length}`)
      .join(', ');
    console.log(`[github] wrote ${snapshot.projects.length} projects (${counts})`);
  } catch (err) {
    const message = (err as Error).message;
    if (strict) {
      console.error(`[github] fetch failed (strict mode): ${message}`);
      process.exit(1);
    }
    if (existsSync(out)) {
      console.warn(`[github] fetch failed, keeping previous snapshot: ${message}`);
    } else {
      await write({ ...empty, warnings: [`GitHub fetch failed: ${message}`] });
      console.warn(`[github] fetch failed, wrote empty snapshot: ${message}`);
    }
  }
}

/** Minimal .env loader (no dependency). Existing env vars win. */
function loadDotEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trimStart().startsWith('#')) continue;
    const [, key, raw] = m as unknown as [string, string, string];
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^(['"])(.*)\1$/, '$2');
  }
}

await main();
