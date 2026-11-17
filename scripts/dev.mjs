/**
 * `npm run dev`: runs the Astro site (http://localhost:4321) and the API
 * (http://localhost:3000) together, with prefixed output. No dependencies.
 * The API uses the in-memory dev store unless api/.env sets DB_HOST.
 */
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const procs = [
  { name: 'site', color: 35, args: ['run', 'dev', '--prefix', 'site'] },
  { name: 'api ', color: 36, args: ['run', 'dev', '--prefix', 'api'] },
].map(({ name, color, args }) => {
  const child = spawn(npm, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on('data', (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) out.write(prefix + line + '\n');
    });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) if (p.exitCode === null) p.kill();
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
