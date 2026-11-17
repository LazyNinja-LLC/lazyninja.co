/**
 * Bundles the API with esbuild into dist/ as plain CommonJS for Node 20:
 *   dist/app.js   Passenger startup file
 *   dist/sync.js  cron job (npm run sync)
 * plus package.json + package-lock.json, so dist/ is exactly what gets deployed
 * to /home/lazyjapy/api. Dependencies stay external and are installed on the
 * server with `npm ci --omit=dev`.
 */
import { build } from 'esbuild';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const sha = (process.env.GITHUB_SHA ?? '').slice(0, 7);
const version = sha ? `${pkg.version}+${sha}` : pkg.version;

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await build({
  entryPoints: { app: 'src/server.ts', sync: 'src/sync.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  packages: 'external',
  sourcemap: false,
  legalComments: 'none',
  define: { __APP_VERSION__: JSON.stringify(version) },
  logLevel: 'info',
});

await copyFile('package.json', 'dist/package.json');
await copyFile('package-lock.json', 'dist/package-lock.json');
console.log(`Built API ${version} → dist/`);
