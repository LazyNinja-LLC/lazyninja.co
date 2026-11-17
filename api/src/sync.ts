/**
 * Cron job (compiled to sync.js, run with `npm run sync`):
 *  1. Refreshes the GitHub repo cache in MySQL.
 *  2. Purges page views older than 13 months and expired rate-limit windows.
 * Exits non-zero if the GitHub refresh fails, so cron mail surfaces problems.
 */
import { loadConfig } from './config';
import { loadEnv } from './env';
import { GitHubCache, githubFetcher } from './lib/github-cache';
import { retentionCutoff } from './lib/retention';
import { createStore } from './store';

async function main() {
  loadEnv();
  const config = loadConfig();
  const store = createStore(config);
  const now = new Date();
  let failed = false;
  try {
    const github = new GitHubCache(store, githubFetcher(config));
    try {
      const { projects } = await github.refresh();
      console.log(`[sync] cached ${projects.length} repos`);
    } catch (err) {
      failed = true;
      console.error(`[sync] GitHub refresh failed: ${(err as Error).message}`);
    }

    const purged = await store.purge({
      pageViewsBefore: retentionCutoff(now),
      rateLimitsBefore: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    });
    console.log(
      `[sync] purged ${purged.pageViews} page views (>13 months) and ${purged.rateLimits} rate-limit rows`,
    );
  } finally {
    await store.close();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`[sync] failed: ${(err as Error).stack ?? err}`);
  process.exit(1);
});
