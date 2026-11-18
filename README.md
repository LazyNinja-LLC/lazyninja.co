# lazyninja.co

The website of **LazyNinja LLC**: a static Astro site plus a small Express API.

- **LazyNinja** is the brand and the company. GitHub org: [LazyNinja-LLC](https://github.com/LazyNinja-LLC).
- **Tyler Mummaw** is the person behind it. Personal GitHub: [WammumTy](https://github.com/WammumTy).
  His name appears only on About, the résumé, the JSON-LD `Person` and contact details.

```
site/      Astro 7 + TypeScript + Tailwind v4 (React islands for filters, contact form, theme toggle)
api/       Express 5 + zod + nodemailer + mysql2, bundled to plain JS for Node 22 / Passenger
shared/    GitHub filter + fetch logic used by both the site build and the API
deploy/    .htaccess source, schema.sql, cron.md
scripts/   dev runner, packaging, .htaccess check
.github/   ci.yml + deploy.yml (+ ssh-setup action)
```

Deployment is covered in [DEPLOY.md](DEPLOY.md), and choices beyond the spec in [DECISIONS.md](DECISIONS.md).

## Requirements

- **Node 22+** for development and the site build (Astro 7 requires ≥ 22.12). `.nvmrc` says 22.
  With nvm-windows: `nvm install 22 && nvm use 22`.
- The **API targets Node 22** (the server runtime) and CI tests it on Node 22.
- **npm** (lockfiles are npm's; `site/` and `api/` are separate npm projects so the API can be
  deployed with its own lockfile and `npm ci --omit=dev`).

## Run it

```sh
npm run bootstrap     # npm ci in the root, site/ and api/
npm run dev           # site → http://localhost:4321, API → http://localhost:3000
```

In dev the API uses an **in-memory store** (no MySQL needed) and prints contact emails to
the console instead of sending them. To use a local MySQL, copy `api/.env.example` to
`api/.env`, set `NODE_ENV=development` plus the `DB_*` values, and import `deploy/schema.sql`.
`STORE=memory` forces the dev store; it is rejected in production.

Optional: `site/.env` with `GITHUB_TOKEN=…` raises the GitHub rate limit for the build-time
project sync (see `site/.env.example`).

## Check & build

```sh
npm run lint          # ESLint + Prettier check (whole repo)
npm run typecheck     # astro check + tsc
npm test              # Vitest (API + shared filter logic)
npm run build         # site → site/dist, API → api/dist
npm run ci            # all of the above, in CI order
npm run package       # manual-deploy zips → deploy/out/site.zip, deploy/out/api.zip
npm run format        # Prettier write
```

Single packages: `npm run <script> --prefix site` / `--prefix api`. Useful extras:
`npm run github --prefix site` (refresh `site/src/data/github.json`),
`SHOW_DRAFTS=1 npm run build --prefix site` (include drafts in a local production build).

## How the pieces fit

- **Static first.** Every page is prerendered. The API only adds live stats, the contact form,
  analytics and `/stats`. If it's down, pages still work: project stats fall back to build
  data, and the contact form falls back to `mailto:tyler@lazyninja.co`.
- **GitHub projects.** At build time `site/scripts/fetch-github.ts` pulls public repos from both
  sources, filters them with `shared/github` and writes `site/src/data/github.json`.
  At runtime the Projects and write-up pages quietly fetch fresh stars and last-updated times
  from `api.lazyninja.co/github/repos`, which is served from a MySQL cache.
- **Analytics.** One cookie-free `sendBeacon` per page view (skipped for Do Not Track / GPC).
  The API stores path, referrer host, country (if a header provides it) and a daily-rotating
  salted hash of IP + user agent. No IPs, no cookies. Data is purged after 13 months.

## How to add content

### A new blog post

Create `site/src/content/blog/my-post.mdx` (the file name becomes `/blog/my-post`):

```mdx
---
title: 'My post'
description: 'One or two sentences for cards, RSS and SEO.'
date: 2026-12-01
updated: 2026-12-05 # optional
tags: ['astro', 'ai']
draft: false # true = visible in `npm run dev`, hidden in production
cover: ../../assets/blog/my-post-cover.png # optional, optimized by Astro
coverAlt: 'What the cover shows'
---

Write Markdown/MDX here. Code blocks get Shiki highlighting.
```

Reading time, a table of contents (long posts), previous/next links, tag pages, RSS and a
per-post Open Graph image are generated automatically. Put images in `site/src/assets/`.

### A new project write-up

Create `site/src/content/projects/my-project.mdx`:

```mdx
---
title: 'My Project'
description: 'What it is in one line.'
repo: 'LazyNinja-LLC/my-project' # or 'WammumTy/my-project'; this sets the source badge
date: 2026-12-01
draft: false
stack: ['Astro', 'TypeScript']
demo: 'https://demo.lazyninja.co' # optional
cover: ../../assets/projects/my-project.png # optional
---

## The problem

## What I built

## Screenshots

## What I learned
```

The page shows live GitHub stats for `repo`, and that repo's card links to the write-up.

### Controlling projects with GitHub topics (no code changes)

Add topics on the repo's GitHub page (⚙ next to "About"):

| Topic                | Effect                                                   |
| -------------------- | -------------------------------------------------------- |
| `lazyninja-shipped`  | Status **Shipped**                                       |
| `lazyninja-building` | Status **Building**                                      |
| `lazyninja-featured` | Shown on the Home page and sorted first                  |
| `lazyninja-hide`     | Never shown                                              |

Without a status topic, a repo counts as **Building** if pushed in the last 60 days, otherwise
**Shipped**. Forks, private repos, profile-README repos (`WammumTy/WammumTy`, `.github`) and
course-code names (pattern in `site/src/config/site.ts` → `GITHUB.excludePatterns`, and
`GITHUB_EXCLUDE_PATTERN` for the API) are never shown. Other topics become filterable tags.

The Projects page follows GitHub within ~15 minutes (API cache, refreshed by cron); the Home
page and the build-time fallback update with the hourly scheduled rebuild or any deploy.

**Custom title, description, image, demo URL or tags** for a repo:
`site/src/content/project-overrides.json`, keyed by `"Owner/name"`.

### Now, About, Labs, Hire

- **Now:** edit `site/src/content/now/now.md` and bump `updated:`. The `summary:` also appears on Home.
- **About:** bio, skills groups and timeline in `site/src/data/about.ts`. The "Languages on
  GitHub" group is generated from your public repos.
- **Labs:** the `LABS` array in `site/src/config/site.ts` (name, description, url, status,
  optional image in `site/public/`).
- **Hire:** services, steps and FAQ in `site/src/data/hire.ts`. Add `price: 'From $…'` to a
  service to show pricing.
- **Socials / nav / GitHub sources:** `site/src/config/site.ts`.

### Swap the résumé

Replace `site/public/resume.pdf` with your PDF (same file name). The About page's
**Download résumé** button links to `/resume.pdf`.

### Brand assets

Logo mark: `site/public/favicon.svg` (also inlined in `site/src/components/Logo.astro`).
After changing it, run `npm run assets --prefix site` to regenerate the PNG/ICO icons.
Open Graph images are rendered per page at build time (`site/src/pages/og/[...slug].png.ts`).
