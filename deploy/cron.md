# Cron jobs (cPanel → Cron Jobs)

Cron is only used for data refresh. The API itself is started on demand by Passenger.

## GitHub cache refresh + analytics purge (every 6 hours)

`npm run sync` (runs `sync.js` from the deployed API) does two things:

1. Refreshes the MySQL GitHub repo cache (`github_repo_cache`) from both sources
   (LazyNinja-LLC org + WammumTy user), using the shared filter rules.
2. Purges `page_views` rows older than **13 months** and expired `rate_limits` rows.

Add this in **cPanel → Cron Jobs → Add New Cron Job**, using the "Once Per Six Hours" preset
(`0 */6 * * *`) or entering the fields by hand:

| Minute | Hour  | Day | Month | Weekday |
| ------ | ----- | --- | ----- | ------- |
| `7`    | `*/6` | `*` | `*`   | `*`     |

Command (one line):

```sh
/bin/bash -c 'source /home/lazyjapy/nodevenv/api/20/bin/activate && cd /home/lazyjapy/api && mkdir -p logs && npm run sync >> logs/sync.log 2>&1'
```

- `source …/activate` puts the cPanel Node 20 `node`/`npm` on the PATH (they are not on the
  default PATH). The path only exists after the Node.js app is created in cPanel.
- It reads `/home/lazyjapy/api/.env` (DB credentials, `GITHUB_SOURCES`, `GITHUB_TOKEN`).
- Output goes to `/home/lazyjapy/api/logs/sync.log`. Deploys never touch `logs/`.
- The job exits non-zero if the GitHub refresh fails. To get an email when that happens,
  set the "Cron Email" address at the top of the cPanel Cron Jobs page and drop the
  `>> logs/sync.log 2>&1` redirect.

## Optional: rotate the sync log (monthly)

```sh
/bin/bash -c 'cd /home/lazyjapy/api/logs && [ -f sync.log ] && tail -n 2000 sync.log > sync.log.tmp && mv sync.log.tmp sync.log'
```

Schedule: `0 3 1 * *`.

## Run it by hand (cPanel → Terminal)

```sh
source /home/lazyjapy/nodevenv/api/20/bin/activate
cd /home/lazyjapy/api
npm run sync
```

Expected output:

```
[sync] cached 10 repos
[sync] purged 0 page views (>13 months) and 3 rate-limit rows
```
