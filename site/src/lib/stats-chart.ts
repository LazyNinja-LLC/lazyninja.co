/**
 * Rendering for the private /stats page. One series (page views) in the accent
 * hue: thin columns (<= 24px, 4px rounded tops, square at the baseline), hairline
 * grid, rounded y ticks, hover tooltip per column, value label on the peak only,
 * plus a table view. Text always uses text tokens, never the series color.
 */
export interface CountRow {
  key: string;
  count: number;
}

export interface Period {
  days: number;
  pageViews: number;
  uniqueVisitors: number;
  topPages: CountRow[];
  topReferrers: CountRow[];
  daily: { day: string; views: number; visitors: number }[];
}

export interface StatsResponse {
  generatedAt: string;
  periods: Period[];
}

const nf = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Fills missing days with zeros so the x-axis is continuous. */
function fillDays(period: Period, generatedAt: string) {
  const end = new Date(generatedAt);
  const byDay = new Map(period.daily.map((d) => [d.day, d]));
  const out = [];
  for (let i = period.days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    out.push(byDay.get(key) ?? { day: key, views: 0, visitors: 0 });
  }
  return out;
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s * 4 >= v) ?? pow * 10;
  return step * 4;
}

export function renderStats(data: StatsResponse, days: number) {
  const period = data.periods.find((p) => p.days === days) ?? data.periods[0];
  if (!period) return;
  const series = fillDays(period, data.generatedAt);

  setText('tile-views', compact.format(period.pageViews));
  setText('tile-visitors', compact.format(period.uniqueVisitors));
  setText('chart-range', `Last ${period.days} days · UTC`);

  renderColumns(document.getElementById('chart')!, series);

  document.getElementById('daily-table')!.innerHTML = series
    .map(
      (d) =>
        `<tr class="border-t border-border"><td class="py-1">${esc(d.day)}</td><td class="py-1">${nf.format(d.views)}</td><td class="py-1">${nf.format(d.visitors)}</td></tr>`,
    )
    .join('');

  renderBars(document.getElementById('top-pages')!, period.topPages, 'No page views yet.');
  renderBars(document.getElementById('top-referrers')!, period.topReferrers, 'No referrers yet.');
}

function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function renderColumns(host: HTMLElement, series: { day: string; views: number; visitors: number }[]) {
  const width = Math.max(280, host.clientWidth);
  const height = 220;
  const pad = { top: 22, right: 8, bottom: 26, left: 40 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(...series.map((d) => d.views), 0));
  const slot = plotW / series.length;
  const barW = Math.min(24, Math.max(2, slot - 2)); // 2px surface gap between neighbors
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const peak = series.reduce((best, d, i) => (d.views > (series[best]?.views ?? -1) ? i : best), 0);
  const labelEvery = Math.ceil(series.length / Math.max(2, Math.floor(plotW / 64)));

  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
  const grid = ticks
    .map(
      (t) =>
        `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(t)}" y2="${y(t)}" stroke="var(--border)" stroke-width="1"/>` +
        `<text x="${pad.left - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)" style="font-variant-numeric:tabular-nums">${nf.format(t)}</text>`,
    )
    .join('');

  const bars = series
    .map((d, i) => {
      const x = pad.left + i * slot + (slot - barW) / 2;
      const top = y(d.views);
      const h = pad.top + plotH - top;
      const r = Math.min(4, barW / 2, h);
      // Rounded data end, square at the baseline.
      const path =
        h <= 0
          ? ''
          : `<path d="M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${top + h}Z" fill="var(--accent)"/>`;
      const label =
        i === peak && d.views > 0
          ? `<text x="${x + barW / 2}" y="${top - 6}" text-anchor="middle" font-size="11" fill="var(--fg)">${nf.format(d.views)}</text>`
          : '';
      const xLabel =
        i % labelEvery === 0 || i === series.length - 1
          ? `<text x="${x + barW / 2}" y="${height - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${dayFmt.format(new Date(d.day))}</text>`
          : '';
      // Hit target is the whole slot, taller than the mark.
      const hit = `<rect data-i="${i}" x="${pad.left + i * slot}" y="${pad.top}" width="${slot}" height="${plotH}" fill="transparent"/>`;
      return path + label + xLabel + hit;
    })
    .join('');

  host.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Page views per day, last ${series.length} days. See the table for values.">${grid}${bars}</svg>
    <div data-tip class="pointer-events-none absolute hidden rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg"></div>`;

  const tip = host.querySelector<HTMLElement>('[data-tip]')!;
  const svg = host.querySelector('svg')!;
  svg.addEventListener('pointermove', (e) => {
    const target = (e.target as Element).closest('[data-i]');
    if (!target) {
      tip.classList.add('hidden');
      return;
    }
    const d = series[Number(target.getAttribute('data-i'))]!;
    tip.innerHTML = `<div class="font-semibold">${esc(dayFmt.format(new Date(d.day)))}</div>
      <div class="mt-1 flex items-center gap-2"><span class="inline-block size-2 rounded-sm bg-accent"></span>${nf.format(d.views)} views</div>
      <div class="text-muted">${nf.format(d.visitors)} visitors</div>`;
    tip.classList.remove('hidden');
    const rect = host.getBoundingClientRect();
    const left = Math.min(e.clientX - rect.left + 12, rect.width - tip.offsetWidth - 4);
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${e.clientY - rect.top - tip.offsetHeight - 12}px`;
  });
  svg.addEventListener('pointerleave', () => tip.classList.add('hidden'));
}

function renderBars(host: HTMLElement, rows: CountRow[], empty: string) {
  if (rows.length === 0) {
    host.innerHTML = `<li class="text-sm text-muted">${esc(empty)}</li>`;
    return;
  }
  const max = Math.max(...rows.map((r) => r.count));
  host.innerHTML = rows
    .map(
      (r) => `<li>
        <div class="flex items-baseline justify-between gap-4 text-sm">
          <span class="truncate font-mono" title="${esc(r.key)}">${esc(r.key)}</span>
          <span class="shrink-0 tabular-nums text-muted">${nf.format(r.count)}</span>
        </div>
        <div class="mt-1 h-2 w-full"><div class="h-2 rounded-r bg-accent" style="width:${Math.max(1, (r.count / max) * 100)}%"></div></div>
      </li>`,
    )
    .join('');
}
