import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminApi, FileRef } from './api';
import { joinFrontMatter, slugify, splitFrontMatter, today, type FrontMatter } from './frontmatter';
import { Field, ListInput, NoticeBar, Toolbar, UploadButton, type Notice } from './ui';

type Kind = 'post' | 'writeup' | 'now';

type FieldSpec =
  | {
      key: string;
      label: string;
      type: 'text' | 'textarea' | 'date' | 'url';
      hint?: string;
      required?: boolean;
    }
  | { key: string; label: string; type: 'list'; hint?: string }
  | { key: string; label: string; type: 'checkbox'; hint?: string }
  | { key: string; label: string; type: 'image'; hint?: string };

const FIELDS: Record<Kind, FieldSpec[]> = {
  post: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    {
      key: 'description',
      label: 'Description',
      type: 'textarea',
      hint: 'One or two sentences for cards, RSS and search engines.',
      required: true,
    },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'updated', label: 'Updated', type: 'date', hint: 'Optional.' },
    { key: 'tags', label: 'Tags', type: 'list' },
    { key: 'draft', label: 'Draft (hidden on the live site)', type: 'checkbox' },
    { key: 'cover', label: 'Cover image', type: 'image', hint: 'Optional. Upload an image to set it.' },
    { key: 'coverAlt', label: 'Cover description (alt text)', type: 'text' },
  ],
  writeup: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'description', label: 'Description', type: 'textarea', required: true },
    {
      key: 'repo',
      label: 'GitHub repo',
      type: 'text',
      hint: 'Owner/name, e.g. LazyNinja-LLC/lazyninja.co or WammumTy/Tyler.AI. Sets the source badge and live stats.',
      required: true,
    },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'draft', label: 'Draft (hidden on the live site)', type: 'checkbox' },
    { key: 'stack', label: 'Stack', type: 'list' },
    { key: 'demo', label: 'Live demo URL', type: 'url', hint: 'Optional.' },
    { key: 'cover', label: 'Cover image', type: 'image' },
    { key: 'coverAlt', label: 'Cover description (alt text)', type: 'text' },
  ],
  now: [
    {
      key: 'summary',
      label: 'Summary',
      type: 'textarea',
      hint: 'Also shown in the "Now" box on the Home page.',
      required: true,
    },
  ],
};

const DIRS = { post: 'site/src/content/blog', writeup: 'site/src/content/projects' } as const;
const NOW_PATH = 'site/src/content/now/now.md';

const TEMPLATES: Record<Kind, () => { data: FrontMatter; body: string }> = {
  post: () => ({
    data: { title: '', description: '', date: today(), tags: [], draft: true },
    body: '## Heading\n\nWrite your post here. Markdown works: **bold**, _italic_, [links](https://example.com), lists and code blocks.\n',
  }),
  writeup: () => ({
    data: { title: '', description: '', repo: '', date: today(), draft: true, stack: [] },
    body: '## The problem\n\n## What I built\n\n## Screenshots\n\n## What I learned\n',
  }),
  now: () => ({ data: { updated: today(), summary: '' }, body: '' }),
};

interface Open {
  path: string;
  sha?: string;
  data: FrontMatter;
  body: string;
  isNew: boolean;
  slug: string;
}

export default function MarkdownEditor({
  api,
  kind,
  onCommitted,
}: {
  api: AdminApi;
  kind: Kind;
  onCommitted: () => void;
}) {
  const [files, setFiles] = useState<FileRef[]>([]);
  const [open, setOpen] = useState<Open | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const refreshList = useCallback(async () => {
    if (kind === 'now') return;
    try {
      const all = await api.files();
      setFiles(kind === 'post' ? all.posts : all.writeups);
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    }
  }, [api, kind]);

  const load = useCallback(
    async (path: string) => {
      setNotice(null);
      try {
        const file = await api.read(path);
        const { data, body } = splitFrontMatter(file.content);
        setOpen({
          path,
          sha: file.sha,
          data,
          body,
          isNew: false,
          slug: path
            .split('/')
            .pop()!
            .replace(/\.mdx?$/, ''),
        });
      } catch (err) {
        setNotice({ kind: 'error', text: (err as Error).message });
      }
    },
    [api],
  );

  useEffect(() => {
    setOpen(null);
    if (kind === 'now') load(NOW_PATH);
    else refreshList();
  }, [kind, load, refreshList]);

  function startNew() {
    const t = TEMPLATES[kind]();
    setOpen({ path: '', data: t.data, body: t.body, isNew: true, slug: '' });
    setNotice(null);
  }

  const set = (key: string, value: unknown) =>
    setOpen((o) => (o ? { ...o, data: { ...o.data, [key]: value } } : o));

  function insertAtCursor(text: string) {
    const el = bodyRef.current;
    setOpen((o) => {
      if (!o) return o;
      const pos = el?.selectionStart ?? o.body.length;
      return { ...o, body: `${o.body.slice(0, pos)}${text}${o.body.slice(pos)}` };
    });
  }

  async function save() {
    if (!open) return;
    const missing = FIELDS[kind].filter(
      (f) => 'required' in f && f.required && !String(open.data[f.key] ?? '').trim(),
    );
    if (missing.length) {
      setNotice({ kind: 'error', text: `Please fill in: ${missing.map((f) => f.label).join(', ')}.` });
      return;
    }
    let path = open.path;
    if (open.isNew) {
      const slug = slugify(open.slug || String(open.data.title ?? ''));
      if (!slug) {
        setNotice({ kind: 'error', text: 'Pick a URL slug (or a title).' });
        return;
      }
      if (files.some((f) => f.name.replace(/\.mdx?$/, '') === slug)) {
        setNotice({ kind: 'error', text: `"${slug}" already exists. Choose another slug.` });
        return;
      }
      // Plain Markdown: unlike MDX, a stray < or { in prose can never break the build.
      path = `${DIRS[kind as 'post' | 'writeup']}/${slug}.md`;
    }
    const data = kind === 'now' ? { ...open.data, updated: today() } : open.data;
    setBusy(true);
    setNotice({ kind: 'info', text: 'Saving…' });
    try {
      const res = await api.save(path, joinFrontMatter(data, open.body), open.sha);
      setOpen({
        ...open,
        path,
        sha: res.sha,
        data,
        isNew: false,
        slug: path
          .split('/')
          .pop()!
          .replace(/\.mdx?$/, ''),
      });
      setNotice({ kind: 'ok', text: 'Saved. The site is rebuilding; it will be live in about 5 minutes.' });
      onCommitted();
      refreshList();
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!open?.sha || open.isNew) return;
    if (!confirm(`Delete ${open.path.split('/').pop()}? This removes it from the live site.`)) return;
    setBusy(true);
    try {
      await api.remove(open.path, open.sha);
      setOpen(null);
      setNotice({ kind: 'ok', text: 'Deleted. The site is rebuilding.' });
      onCommitted();
      refreshList();
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const urlBase = kind === 'post' ? '/blog/' : '/projects/';

  return (
    <div className={kind === 'now' ? 'space-y-5' : 'grid gap-6 lg:grid-cols-[16rem_1fr]'}>
      {kind !== 'now' ? (
        <aside className="space-y-3">
          <button type="button" className="btn-primary w-full" onClick={startNew}>
            + New {kind === 'post' ? 'post' : 'write-up'}
          </button>
          <ul className="card divide-y divide-border text-sm">
            {files.length === 0 ? <li className="p-3 text-muted">Nothing yet.</li> : null}
            {files.map((f) => (
              <li key={f.path}>
                <button
                  type="button"
                  onClick={() => load(f.path)}
                  className={`block w-full truncate px-3 py-2 text-left font-mono hover:text-accent ${open?.path === f.path ? 'text-accent' : ''}`}
                >
                  {f.name}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      <div className="space-y-5">
        <NoticeBar notice={notice} />
        {!open ? (
          kind !== 'now' ? (
            <p className="text-muted">Pick a file on the left, or create a new one.</p>
          ) : (
            <p className="text-muted">Loading…</p>
          )
        ) : (
          <div className="card space-y-5 p-5">
            {open.isNew ? (
              <Field
                label="URL slug"
                hint={`The page will be at ${urlBase}${slugify(open.slug || String(open.data.title ?? '')) || '…'}. Can't be changed later.`}
              >
                <input
                  className="input !py-2"
                  value={open.slug}
                  placeholder="from the title"
                  onChange={(e) => setOpen({ ...open, slug: e.target.value })}
                />
              </Field>
            ) : kind !== 'now' ? (
              <p className="font-mono text-xs text-muted">
                {open.path} ·{' '}
                <a className="link" href={`${urlBase}${open.slug}`} target="_blank" rel="noopener">
                  view live
                </a>
              </p>
            ) : (
              <p className="text-xs text-muted">The "last updated" date is set to today when you save.</p>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {FIELDS[kind].map((f) => {
                const value = open.data[f.key];
                const wide = f.type === 'textarea' ? 'md:col-span-2' : '';
                return (
                  <div key={f.key} className={wide}>
                    <Field
                      label={f.label + ('required' in f && f.required ? ' *' : '')}
                      {...(f.hint ? { hint: f.hint } : {})}
                    >
                      {f.type === 'textarea' ? (
                        <textarea
                          className="input"
                          rows={3}
                          value={String(value ?? '')}
                          onChange={(e) => set(f.key, e.target.value)}
                        />
                      ) : f.type === 'list' ? (
                        <ListInput
                          key={`${open.path}-${f.key}`}
                          value={Array.isArray(value) ? value.map(String) : []}
                          onChange={(v) => set(f.key, v)}
                        />
                      ) : f.type === 'checkbox' ? (
                        <input
                          type="checkbox"
                          className="size-5 accent-[var(--accent)]"
                          checked={value === true}
                          onChange={(e) => set(f.key, e.target.checked)}
                        />
                      ) : f.type === 'image' ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <input
                            className="input !py-2 flex-1"
                            value={String(value ?? '')}
                            onChange={(e) => set(f.key, e.target.value)}
                            placeholder="none"
                          />
                          <UploadButton
                            api={api}
                            kind="image"
                            accept="image/*"
                            label="Upload"
                            onUploaded={(ref) => set(f.key, ref)}
                            onNotice={setNotice}
                          />
                        </span>
                      ) : (
                        <input
                          className="input !py-2"
                          type={f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'}
                          value={String(value ?? '')}
                          onChange={(e) => set(f.key, e.target.value)}
                        />
                      )}
                    </Field>
                  </div>
                );
              })}
            </div>

            <Field
              label="Content (Markdown)"
              hint="Headings with ##, **bold**, _italic_, [link](https://…), - lists, ``` code blocks."
            >
              <textarea
                ref={bodyRef}
                className="input min-h-[24rem] font-mono text-sm leading-relaxed"
                value={open.body}
                onChange={(e) => setOpen({ ...open, body: e.target.value })}
              />
            </Field>

            <Toolbar>
              <button type="button" className="btn-primary" disabled={busy} onClick={save}>
                {busy ? 'Saving…' : open.isNew ? 'Create & publish' : 'Save & publish'}
              </button>
              {kind !== 'now' ? (
                <UploadButton
                  api={api}
                  kind="image"
                  accept="image/*"
                  label="Insert image"
                  onUploaded={(ref) => insertAtCursor(`\n![Describe the image](${ref})\n`)}
                  onNotice={setNotice}
                />
              ) : null}
              {!open.isNew && kind !== 'now' ? (
                <button
                  type="button"
                  className="ml-auto text-sm text-muted hover:text-accent"
                  disabled={busy}
                  onClick={remove}
                >
                  Delete
                </button>
              ) : null}
            </Toolbar>
          </div>
        )}
      </div>
    </div>
  );
}
