import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Loads `.env` without a dependency. Looks next to the running file first
 * (the server's /home/lazyjapy/api/.env), then in the working directory.
 * Variables already present in the environment always win.
 */
export function loadEnv(dirs: string[] = [__dirname, process.cwd()]): string | null {
  for (const dir of dirs) {
    const file = join(dir, '.env');
    if (!existsSync(file)) continue;
    for (const [key, value] of parseEnv(readFileSync(file, 'utf8'))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
    return file;
  }
  return null;
}

export function parseEnv(source: string): [string, string][] {
  const out: [string, string][] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1]!;
    let value = match[2]!;
    const quoted = value.match(/^(['"])([\s\S]*)\1$/);
    if (quoted) {
      value = quoted[2]!;
      if (quoted[1] === '"') value = value.replace(/\\n/g, '\n');
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    out.push([key, value]);
  }
  return out;
}
