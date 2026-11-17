/**
 * Refreshes stars / last-updated on write-up pages from the API.
 * Silent no-op on any failure: build-time data stays in place.
 */
const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export async function refreshRepoStats() {
  const el = document.querySelector<HTMLElement>('[data-repo-stats]');
  const api = document.documentElement.dataset.api;
  if (!el || !api) return;
  const key = el.dataset.repoStats;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${api}/github/repos`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return;
    const data = (await res.json()) as {
      repos?: { key: string; stars: number; updatedAt: string | null }[];
    };
    const repo = data.repos?.find((r) => r.key.toLowerCase() === key);
    if (!repo) return;
    const stars = el.querySelector('[data-stat="stars"]');
    if (stars) stars.textContent = String(repo.stars);
    const updated = el.querySelector<HTMLTimeElement>('[data-stat="updated"]');
    if (updated && repo.updatedAt) {
      updated.dateTime = repo.updatedAt;
      updated.textContent = fmt.format(new Date(repo.updatedAt));
    }
  } catch {
    /* keep build data */
  }
}
