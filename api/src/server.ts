/**
 * Passenger startup file (compiled to app.js). Passenger provides PORT.
 */
import { createApp } from './app';
import { loadConfig, VERSION } from './config';
import { loadEnv } from './env';
import { GitHubCache, githubFetcher } from './lib/github-cache';
import { consoleMailer, createMailer } from './lib/mailer';
import { createStore } from './store';

loadEnv();
const config = loadConfig();
const store = createStore(config);
const mailer = createMailer(config) ?? (config.isProd ? null : consoleMailer);
const github = new GitHubCache(store, githubFetcher(config));

const app = createApp({ config, store, mailer, github });
const server = app.listen(config.port, () => {
  console.log(
    `[api] lazyninja.co API ${VERSION} listening on :${config.port} (${config.env}, store=${store.kind})`,
  );
});

function shutdown() {
  server.close(() => {
    store.close().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
