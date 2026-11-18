import { useCallback, useEffect, useState } from 'react';
import type { AdminApi, DeployRun } from './api';
import { NoticeBar, type Notice } from './ui';

const timeFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function describe(run: DeployRun): { icon: string; text: string; tone: string } {
  if (run.status !== 'completed')
    return { icon: '◐', text: run.status === 'queued' ? 'Queued' : 'Publishing…', tone: 'text-building' };
  if (run.conclusion === 'success') return { icon: '●', text: 'Live', tone: 'text-shipped' };
  if (run.conclusion === 'cancelled' || run.conclusion === 'skipped')
    return { icon: '○', text: 'Cancelled', tone: 'text-muted' };
  return { icon: '✕', text: 'Failed (site unchanged)', tone: 'text-accent' };
}

/** Recent deploys plus "publish now" actions. Polls while something is in progress. */
export default function DeployPanel({ api, bump }: { api: AdminApi; bump: number }) {
  const [runs, setRuns] = useState<DeployRun[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<'deploy' | 'sync' | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRuns((await api.deploys()).runs);
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    }
  }, [api]);

  // Refresh right away, and again shortly after each save (GitHub needs a moment to start the run).
  useEffect(() => {
    refresh();
    const t = setTimeout(refresh, 6000);
    return () => clearTimeout(t);
  }, [refresh, bump]);

  const active = runs.some((r) => r.status !== 'completed');
  useEffect(() => {
    if (!active) return;
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [active, refresh]);

  async function run(kind: 'deploy' | 'sync') {
    setBusy(kind);
    try {
      if (kind === 'deploy') {
        await api.deploy();
        setNotice({ kind: 'ok', text: 'Rebuild started. Live in about 5 minutes.' });
        setTimeout(refresh, 5000);
      } else {
        const res = await api.syncProjects();
        setNotice({
          kind: 'ok',
          text: `Projects refreshed from GitHub (${res.count} repos). The Projects page shows them now; Home updates with the next rebuild.`,
        });
      }
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card space-y-4 p-5" aria-labelledby="deploys-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="deploys-title" className="font-display text-lg font-bold">
          Publishing
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost !px-3 !py-1.5"
            disabled={busy !== null}
            onClick={() => run('sync')}
          >
            {busy === 'sync' ? 'Refreshing…' : 'Refresh projects from GitHub'}
          </button>
          <button
            type="button"
            className="btn-ghost !px-3 !py-1.5"
            disabled={busy !== null}
            onClick={() => run('deploy')}
          >
            {busy === 'deploy' ? 'Starting…' : 'Rebuild site now'}
          </button>
        </div>
      </div>
      <NoticeBar notice={notice} />
      <ul className="divide-y divide-border text-sm">
        {runs.length === 0 ? <li className="py-2 text-muted">No deploys yet.</li> : null}
        {runs.slice(0, 5).map((r) => {
          const d = describe(r);
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className={`w-44 shrink-0 font-medium ${d.tone}`}>
                <span aria-hidden="true">{d.icon}</span> {d.text}
              </span>
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <span className="text-xs text-muted">{timeFmt.format(new Date(r.createdAt))}</span>
              <a className="link text-xs" href={r.url} target="_blank" rel="noopener">
                details
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
