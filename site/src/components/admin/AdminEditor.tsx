import { useEffect, useMemo, useState } from 'react';
import { createAdminApi, getToken } from './api';
import DeployPanel from './DeployPanel';
import JsonForm from './JsonForm';
import MarkdownEditor from './MarkdownEditor';
import { NoticeBar, UploadButton, type Notice } from './ui';

const TABS = [
  ['posts', 'Blog posts'],
  ['writeups', 'Project write-ups'],
  ['now', 'Now'],
  ['about', 'About'],
  ['hire', 'Hire'],
  ['site', 'Site & Labs'],
  ['projects', 'Projects'],
  ['files', 'Résumé & images'],
] as const;
type Tab = (typeof TABS)[number][0];

/**
 * The site editor behind the admin token. Every save is a commit to the repo, which runs the
 * normal CI + deploy: changes go live in ~5 minutes, a broken edit never ships, and every
 * change is in git history.
 */
export default function AdminEditor({ apiUrl }: { apiUrl: string }) {
  const api = useMemo(() => createAdminApi(apiUrl), [apiUrl]);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('posts');
  const [bump, setBump] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const committed = () => setBump((n) => n + 1);

  // The stats page owns login; start once a token is stored.
  useEffect(() => {
    const start = () => setReady(!!getToken());
    start();
    window.addEventListener('ln-admin-ready', start);
    return () => window.removeEventListener('ln-admin-ready', start);
  }, []);

  useEffect(() => {
    if (!ready) return;
    api
      .status()
      .then((s) => setEditing(s.editing))
      .catch((err: Error) => setNotice({ kind: 'error', text: err.message }));
  }, [api, ready]);

  if (!ready) return null;
  if (editing === null)
    return notice ? <NoticeBar notice={notice} /> : <p className="text-muted">Checking editor access…</p>;
  if (!editing) {
    return (
      <div className="card space-y-2 p-6">
        <p className="font-display text-lg font-bold">Editing isn't switched on yet</p>
        <p className="text-sm text-muted">
          Add <code>GITHUB_WRITE_TOKEN</code> to <code>/home/lazyjapy/api/.env</code> and restart the API.
          DEPLOY.md, section "Site editor", has the exact steps.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DeployPanel api={api} bump={bump} />

      <nav aria-label="Editor sections" className="-mx-1 overflow-x-auto">
        <ul className="flex gap-1 px-1">
          {TABS.map(([id, text]) => (
            <li key={id}>
              <button
                type="button"
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id)}
                className={`rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === id ? 'bg-accent text-accent-ink' : 'text-muted hover:text-accent'
                }`}
              >
                {text}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {tab === 'posts' ? <MarkdownEditor key="post" api={api} kind="post" onCommitted={committed} /> : null}
      {tab === 'writeups' ? (
        <MarkdownEditor key="writeup" api={api} kind="writeup" onCommitted={committed} />
      ) : null}
      {tab === 'now' ? <MarkdownEditor key="now" api={api} kind="now" onCommitted={committed} /> : null}
      {tab === 'about' ? (
        <JsonForm
          key="about"
          api={api}
          path="site/src/content/settings/about.json"
          title="About page"
          intro='Your bio, skills and timeline on /about. (The "Languages on GitHub" group is generated automatically.)'
          onCommitted={committed}
        />
      ) : null}
      {tab === 'hire' ? (
        <JsonForm
          key="hire"
          api={api}
          path="site/src/content/settings/hire.json"
          title="Hire page"
          intro="Services, the how-we-work steps and the FAQ on /hire. Fill in a price to show it; leave it empty to hide it."
          onCommitted={committed}
        />
      ) : null}
      {tab === 'site' ? (
        <JsonForm
          key="site"
          api={api}
          path="site/src/content/settings/site.json"
          title="site settings"
          intro="Tagline (Home, footer, page titles), the default description, your LinkedIn link and the Labs page entries."
          onCommitted={committed}
        />
      ) : null}
      {tab === 'projects' ? (
        <div className="space-y-6">
          <div className="card space-y-2 p-5 text-sm">
            <p className="font-display text-lg font-bold">
              Status, featured and hidden come from GitHub topics
            </p>
            <p className="text-muted">
              On the repo's GitHub page, click the ⚙ next to <em>About</em> and add a topic:{' '}
              <code>lazyninja-shipped</code>, <code>lazyninja-building</code>, <code>lazyninja-featured</code>{' '}
              or <code>lazyninja-hide</code>. Then click <strong>Refresh projects from GitHub</strong> above
              (Projects page) and <strong>Rebuild site now</strong> (Home page).
            </p>
          </div>
          <JsonForm
            key="overrides"
            api={api}
            path="site/src/content/project-overrides.json"
            title="project overrides"
            intro="Optional: show a different title, description, demo link, image or tags than GitHub has. Empty fields keep GitHub's value."
            keyed={{
              addLabel: '+ Add override',
              keyPlaceholder: 'Owner/name, e.g. WammumTy/Tyler.AI',
              template: { title: '', description: '', demo: '', image: '', tags: [] },
            }}
            onCommitted={committed}
          />
        </div>
      ) : null}
      {tab === 'files' ? <FilesTab api={api} onCommitted={committed} /> : null}
    </div>
  );
}

function FilesTab({ api, onCommitted }: { api: ReturnType<typeof createAdminApi>; onCommitted: () => void }) {
  const [notice, setNotice] = useState<Notice>(null);
  const [images, setImages] = useState<{ name: string; path: string; sha: string; ref: string }[]>([]);
  const load = () =>
    api
      .files()
      .then((f) => setImages(f.images))
      .catch((err: Error) => setNotice({ kind: 'error', text: err.message }));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <NoticeBar notice={notice} />
      <section className="card space-y-3 p-5">
        <h2 className="font-display text-lg font-bold">Résumé</h2>
        <p className="text-sm text-muted">
          Replaces{' '}
          <a className="link" href="/resume.pdf" target="_blank" rel="noopener">
            /resume.pdf
          </a>{' '}
          (the About page's download button). PDF only, up to 5 MB.
        </p>
        <UploadButton
          api={api}
          kind="resume"
          accept="application/pdf"
          label="Upload new résumé (PDF)"
          onUploaded={onCommitted}
          onNotice={setNotice}
        />
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="font-display text-lg font-bold">Images for posts & write-ups</h2>
        <p className="text-sm text-muted">
          Uploaded images are optimized automatically. Use them in Markdown as{' '}
          <code>![description](reference)</code>, or with the editor's "Insert image" button.
        </p>
        <UploadButton
          api={api}
          kind="image"
          accept="image/*"
          label="Upload image"
          onUploaded={(ref) => {
            onCommitted();
            load();
            navigator.clipboard?.writeText(ref).catch(() => {});
          }}
          onNotice={setNotice}
        />
        <ul className="divide-y divide-border text-sm">
          {images.map((img) => (
            <li key={img.path} className="flex flex-wrap items-center gap-3 py-2">
              <code className="min-w-0 flex-1 truncate text-xs">{img.ref}</code>
              <button
                type="button"
                className="link text-xs"
                onClick={() => navigator.clipboard?.writeText(img.ref)}
              >
                Copy reference
              </button>
              <button
                type="button"
                className="text-xs text-muted hover:text-accent"
                onClick={async () => {
                  if (
                    !confirm(
                      `Delete ${img.name}? Posts that use it will fail to build until the reference is removed.`,
                    )
                  )
                    return;
                  try {
                    await api.remove(img.path, img.sha);
                    setNotice({ kind: 'ok', text: `Deleted ${img.name}.` });
                    onCommitted();
                    load();
                  } catch (err) {
                    setNotice({ kind: 'error', text: (err as Error).message });
                  }
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
