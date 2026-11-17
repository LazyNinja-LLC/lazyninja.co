# Deploying lazyninja.co

Two pieces, two destinations, one Namecheap shared-hosting account (cPanel + CloudLinux):

| Piece                     | Built from                                | Lives at                       | Served by                                 |
| ------------------------- | ----------------------------------------- | ------------------------------ | ----------------------------------------- |
| Static site               | `site/` → `site/dist/`                    | `/home/lazyjapy/public_html/`  | LiteSpeed, rules in `.htaccess`           |
| API (`api.lazyninja.co`)  | `api/` → `api/dist/` (`app.js`, `sync.js`) | `/home/lazyjapy/api/`          | cPanel "Setup Node.js App" (Passenger)    |

The site is 100% static and works fully even if the API is down or not set up yet.

---

## 1. How auto-deploy works

Push to `main` → `.github/workflows/deploy.yml`:

1. **Detect changes**: diffs the push. `site/**`, `deploy/**` or `shared/**` → site job.
   `api/**` or `shared/**` → API job. A manual run (**Actions → Deploy → Run workflow**) deploys
   both. A daily scheduled run rebuilds the site so GitHub stats and new repos stay fresh.
2. **CI** (`ci.yml`, called as a reusable workflow): lint + Prettier, `.htaccess` copy check,
   site type-check + build, API type-check + tests + build (API on Node 20, like the server).
   Nothing deploys unless CI passes. The deploy build is _strict_: if GitHub can't be reached,
   the build fails instead of shipping an empty Projects page.
3. **Deploy site**: `rsync -az --delete site/dist/ → public_html/`, excluding `.well-known/`
   (AutoSSL) and `cgi-bin/`. The `.htaccess` ships inside the build.
4. **Deploy API**: `rsync -az --delete api/dist/ → /home/lazyjapy/api/`, excluding `.env`,
   `node_modules/`, `tmp/`, `logs/` (plus `public/`, `.htaccess` and `stderr.log`, which
   Passenger/cPanel may create). Then, over SSH:
   - if `/home/lazyjapy/nodevenv/api/20/bin/activate` exists: activate it, `npm ci --omit=dev`,
     `touch tmp/restart.txt` (Passenger restart);
   - otherwise: print a warning (**"Node app not created in cPanel yet"**) and skip without failing.
5. **Smoke test**: `curl -fsS https://lazyninja.co/` (retried; **fails** the run if down) and
   `curl -fsS https://api.lazyninja.co/health` (retried; **warning only**).

Deploys never overlap (`concurrency: deploy`, queued, never cancelled mid-rsync). SSH uses
`StrictHostKeyChecking=yes` with a pinned `known_hosts`; host checking is never disabled and
`ssh-keyscan` never runs in CI. No secret is ever echoed.

### Required GitHub secrets

**Repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret            | Value                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| `SSH_HOST`        | `premium149.web-hosting.com`                                                |
| `SSH_PORT`        | `21098`                                                                     |
| `SSH_USER`        | `lazyjapy`                                                                  |
| `SSH_PRIVATE_KEY` | The full private key of the deploy key already authorized on the server (including the `-----BEGIN …-----` / `-----END …-----` lines) |
| `SSH_KNOWN_HOSTS` | The server's host key line(s), see below                                    |

The build-time GitHub fetch uses the built-in `secrets.GITHUB_TOKEN`. Nothing to add.

**Getting `SSH_KNOWN_HOSTS`**: on your own machine (once, not in CI):

```sh
ssh-keyscan -p 21098 premium149.web-hosting.com 2>/dev/null > known_hosts.txt
ssh-keygen -lf known_hosts.txt   # check these fingerprints before trusting them
```

Compare the fingerprints with the ones you see on your first manual
`ssh -p 21098 lazyjapy@premium149.web-hosting.com` login (or ask Namecheap support for the
server's host key fingerprints). Paste the full contents of `known_hosts.txt` as the secret.
Lines look like `[premium149.web-hosting.com]:21098 ssh-ed25519 AAAA…`.

---

## 2. One-time server setup (cPanel)

Do these once, in order. The first push to `main` can happen before or after: the site
deploys immediately and the API job skips cleanly until step 2.2 is done.

### 2.1 Subdomain `api.lazyninja.co`

**cPanel → Domains → Create A New Domain**

- Domain: `api.lazyninja.co`
- Uncheck "Share document root". Document root: `/home/lazyjapy/api.lazyninja.co`
  (any folder works; Passenger routes requests to the app). **Not** `/home/lazyjapy/api`.

### 2.2 Node.js app

**cPanel → Software → Setup Node.js App → Create Application**

| Field                    | Value                    |
| ------------------------ | ------------------------ |
| Node.js version          | **20.x**                 |
| Application mode         | **Production**           |
| Application root         | `api` (= `/home/lazyjapy/api`) |
| Application URL          | `api.lazyninja.co`       |
| Application startup file | `app.js`                 |

Click **Create**. This creates `/home/lazyjapy/nodevenv/api/20/bin/activate`, the path the
deploy and cron rely on. If the deploy already synced files into `/home/lazyjapy/api`, that's
fine. If cPanel created a sample `app.js`, the next deploy overwrites it.

You don't need cPanel's "Environment variables" section: the app reads `/home/lazyjapy/api/.env`
(step 2.4). Don't click "Run NPM Install" either; the deploy runs `npm ci --omit=dev`.

### 2.3 MySQL database

**cPanel → Databases → MySQL Databases**

1. Create database, e.g. `lazyjapy_site`.
2. Create user, e.g. `lazyjapy_api`, with a long random password.
3. Add the user to the database with **ALL PRIVILEGES**.
4. **cPanel → phpMyAdmin** → select the database → **Import** → upload `deploy/schema.sql` → Go.
   (Safe to re-run; every statement is `CREATE TABLE IF NOT EXISTS`.)

Tables: `github_repo_cache`, `sync_state`, `contact_messages`, `rate_limits`, `page_views`.

### 2.4 `.env` on the server

Create `/home/lazyjapy/api/.env` with **cPanel → File Manager** (enable "Show Hidden Files")
or the Terminal. Use every variable from `api/.env.example`:

```ini
NODE_ENV=production

DB_HOST=localhost
DB_USER=lazyjapy_api
DB_PASSWORD=<the MySQL password from 2.3>
DB_NAME=lazyjapy_site

SMTP_HOST=mail.lazyninja.co
SMTP_PORT=465
SMTP_USER=no-reply@lazyninja.co
SMTP_PASS=<password of the no-reply@lazyninja.co mailbox>
MAIL_TO=tyler@lazyninja.co

GITHUB_SOURCES=org:LazyNinja-LLC,user:WammumTy
GITHUB_TOKEN=<optional: fine-grained token, public read-only>

ADMIN_TOKEN=<openssl rand -hex 32>
ANALYTICS_SALT_SECRET=<openssl rand -hex 32, a different value>

ALLOWED_ORIGINS=https://lazyninja.co,https://www.lazyninja.co
```

Then `chmod 600 /home/lazyjapy/api/.env`. Deploys never overwrite or delete this file.
The API refuses to start in production if a required value is missing; the reason is in
`/home/lazyjapy/api/stderr.log` (or the Passenger log shown in the Node.js app screen).

Mailboxes `tyler@lazyninja.co` and `no-reply@lazyninja.co` must exist (**cPanel → Email Accounts**).

After creating `.env`, restart the app (**Setup Node.js App → Restart**), or re-run the deploy.

### 2.5 Cron job

See [`deploy/cron.md`](deploy/cron.md): every 6 hours, `npm run sync` (GitHub cache refresh +
13-month analytics purge). Run it once by hand to fill the cache right away.

### 2.6 SSL (AutoSSL)

**cPanel → Security → SSL/TLS Status** → select `lazyninja.co`, `www.lazyninja.co` and
`api.lazyninja.co` → **Run AutoSSL**. The `.htaccess` leaves `/.well-known/` alone and the
deploy never deletes it, so renewals keep working. Once certificates are issued, the
`.htaccess` forces HTTPS and redirects `www` → `lazyninja.co`.

### 2.7 First full deploy

**GitHub → Actions → Deploy → Run workflow** (on `main`). Both the site and the API deploy,
then the smoke tests run (section 5).

---

## 3. Rollback

- **Preferred:** revert the bad commit and push.
  ```sh
  git revert <sha>
  git push origin main
  ```
  The deploy rebuilds and syncs the previous state.
- **Faster:** **Actions → Deploy**, open the last good run, **Re-run all jobs**. It re-runs
  from that commit's code. (Note: a re-run rebuilds the site with _current_ GitHub data.)
- The API's `.env`, database and `node_modules` are never touched by a deploy, so rolling back
  code is always safe. Schema changes (none yet) would need their own down-migration.

---

## 4. Manual fallback (no GitHub Actions)

```sh
npm run bootstrap   # once: install root, site and api dependencies
npm run package     # builds everything, writes deploy/out/site.zip and deploy/out/api.zip
```

- `deploy/out/site.zip`: the whole static site, including `.htaccess`.
  **cPanel → File Manager → public_html → Upload** the zip, then **Extract**, overwriting.
  (Old files aren't removed this way. Delete stale ones by hand if needed; never delete
  `.well-known/` or `cgi-bin/`.)
- `deploy/out/api.zip`: `app.js`, `sync.js`, `package.json`, `package-lock.json` (no
  `node_modules`, `.env` or tests). Upload and extract into `/home/lazyjapy/api/`, then:
  ```sh
  source /home/lazyjapy/nodevenv/api/20/bin/activate
  cd /home/lazyjapy/api
  npm ci --omit=dev
  mkdir -p tmp && touch tmp/restart.txt
  ```

---

## 5. Smoke tests

```sh
# Site: 200 and HTML
curl -fsS -o /dev/null -w "%{http_code}\n" https://lazyninja.co/

# Redirects: www and http go to https://lazyninja.co (301), .html and trailing slash are cleaned
curl -sI http://lazyninja.co/ | grep -i '^location'
curl -sI https://www.lazyninja.co/projects | grep -i '^location'
curl -sI https://lazyninja.co/projects.html | grep -i '^location'
curl -sI https://lazyninja.co/projects/ | grep -i '^location'

# Clean URLs and 404
curl -fsS -o /dev/null -w "%{http_code}\n" https://lazyninja.co/projects
curl -s -o /dev/null -w "%{http_code}\n" https://lazyninja.co/definitely-not-here   # 404

# Security headers + CSP
curl -sI https://lazyninja.co/ | grep -iE 'content-security-policy|strict-transport|x-content-type'

# API
curl -fsS https://api.lazyninja.co/health                       # {"ok":true,"version":"1.0.0+abc1234"}
curl -fsS "https://api.lazyninja.co/github/repos?source=lazyninja" | head -c 300
curl -s -o /dev/null -w "%{http_code}\n" https://api.lazyninja.co/stats              # 401
curl -fsS https://api.lazyninja.co/stats -H "Authorization: Bearer $ADMIN_TOKEN" | head -c 300

# CORS: allowed origin echoes back, others don't
curl -sI https://api.lazyninja.co/health -H "Origin: https://lazyninja.co" | grep -i access-control-allow-origin
```

The contact form is easiest to test in a browser at https://lazyninja.co/contact. Wait at least
3 seconds before sending. More than 5 submissions an hour from one IP returns 429.

---

## Troubleshooting

| Symptom                                    | Check                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------- |
| Deploy fails at SSH: "Host key verification failed" | `SSH_KNOWN_HOSTS` must contain the `[host]:21098` entry (section 1). |
| API job warns "Node app not created in cPanel yet" | Do step 2.2, then re-run the deploy.                              |
| `/health` 503 / app won't start            | `/home/lazyjapy/api/stderr.log`: usually a missing `.env` value.      |
| Projects page shows old stats              | Normal until the API cache is filled: run `npm run sync` (cron.md).  |
| Contact form shows the email fallback      | API down or CORS: check `/health` and `ALLOWED_ORIGINS`.             |
| `/stats` says "Could not reach the API"    | Same as above; the dashboard calls the API from the browser.          |
