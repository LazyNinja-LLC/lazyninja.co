import type { Config } from '../config';
import { MemoryStore } from './memory';
import { MySqlStore } from './mysql';
import type { Store } from './types';

export function createStore(config: Config): Store {
  if (config.store === 'memory') {
    if (config.isProd) throw new Error('The in-memory store is not allowed in production');
    console.warn(
      '[store] using the in-memory dev store (data is lost on restart). Set DB_HOST to use MySQL.',
    );
    return new MemoryStore();
  }
  return new MySqlStore(config.db);
}
