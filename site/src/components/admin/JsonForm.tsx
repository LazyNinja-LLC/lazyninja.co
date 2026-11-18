import { useCallback, useEffect, useId, useState } from 'react';
import type { AdminApi } from './api';
import { NoticeBar, Toolbar, UploadButton, type Notice } from './ui';

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };

/** Fixed choices for some keys (validated again at build time). */
const CHOICES: Record<string, string[]> = {
  status: ['live', 'beta', 'planned', 'retired'],
};
/** Keys whose strings get a multi-line box. */
const LONG = new Set(['bio', 'text', 'summary', 'description', 'lead', 'lede', 'nightLede']);
/** Shapes for new items in lists of objects (used when a list is empty). */
const TEMPLATES: Record<string, Obj> = {
  labs: { name: '', description: '', url: 'https://', status: 'planned', image: '' },
  skillGroups: { title: '', items: [], placeholder: false },
  timeline: { when: '', title: '', text: '', placeholder: false },
};
const LABELS: Record<string, string> = {
  skillGroups: 'Skill groups',
  linkedin: 'LinkedIn URL',
  coverAlt: 'Cover alt text',
  placeholder: 'Placeholder (dashed style)',
  image: 'Image (empty = none)',
  hero: 'Hero',
  about: 'About teaser',
  contact: 'Contact band',
  lede: 'Intro',
  nightLede: 'Night intro',
};

function label(key: string): string {
  return LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

function blankLike(value: Json): Json {
  if (Array.isArray(value)) return [];
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, blankLike(v)]));
  if (typeof value === 'boolean') return false;
  if (typeof value === 'number') return 0;
  return '';
}

interface Props {
  api: AdminApi;
  path: string;
  title: string;
  intro?: string;
  /** For maps keyed by user input (project overrides): label + template for new entries. */
  keyed?: { addLabel: string; keyPlaceholder: string; template: Obj };
  onCommitted: () => void;
}

export default function JsonForm({ api, path, title, intro, keyed, onCommitted }: Props) {
  const [value, setValue] = useState<Obj | null>(null);
  const [sha, setSha] = useState<string>();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState('');

  const load = useCallback(async () => {
    setValue(null);
    setNotice(null);
    try {
      const file = await api.read(path);
      setValue(JSON.parse(file.content) as Obj);
      setSha(file.sha);
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    }
  }, [api, path]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!value) return;
    setBusy(true);
    setNotice({ kind: 'info', text: 'Saving…' });
    try {
      const res = await api.save(path, `${JSON.stringify(value, null, 2)}\n`, sha, `update ${title}`);
      setSha(res.sha);
      setNotice({ kind: 'ok', text: 'Saved. The site is rebuilding; changes are live in about 5 minutes.' });
      onCommitted();
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {intro ? <p className="text-sm text-muted">{intro}</p> : null}
      <NoticeBar notice={notice} />
      {!value ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <>
          <div className="card space-y-6 p-5">
            {Object.entries(value)
              .filter(([k]) => !k.startsWith('$'))
              .map(([k, v]) => (
                <Node
                  key={k}
                  name={k}
                  value={v}
                  api={api}
                  onNotice={setNotice}
                  onChange={(next) => setValue({ ...value, [k]: next })}
                  {...(keyed
                    ? {
                        onRemove: () =>
                          setValue(Object.fromEntries(Object.entries(value).filter(([kk]) => kk !== k))),
                      }
                    : {})}
                  heading={keyed ? k : v && typeof v === 'object' && !Array.isArray(v) ? label(k) : undefined}
                />
              ))}
            {keyed ? (
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <input
                  className="input !py-2 max-w-xs"
                  value={newKey}
                  placeholder={keyed.keyPlaceholder}
                  onChange={(e) => setNewKey(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-ghost !py-2"
                  disabled={!/^[\w.-]+\/[\w.-]+$/.test(newKey.trim()) || newKey.trim() in value}
                  onClick={() => {
                    setValue({ ...value, [newKey.trim()]: structuredClone(keyed.template) });
                    setNewKey('');
                  }}
                >
                  {keyed.addLabel}
                </button>
              </div>
            ) : null}
          </div>
          <Toolbar>
            <button type="button" className="btn-primary" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save & publish'}
            </button>
            <button
              type="button"
              className="text-sm text-muted hover:text-accent"
              disabled={busy}
              onClick={load}
            >
              Discard changes
            </button>
          </Toolbar>
        </>
      )}
    </div>
  );
}

function Node({
  name,
  value,
  onChange,
  onRemove,
  api,
  onNotice,
  heading,
}: {
  name: string;
  value: Json;
  onChange: (v: Json) => void;
  onRemove?: () => void;
  api: AdminApi;
  onNotice: (n: Notice) => void;
  heading?: string | undefined;
}) {
  const id = useId();
  // Lists
  if (Array.isArray(value)) {
    const template = (TEMPLATES[name] ?? (value[0] !== undefined ? blankLike(value[0]) : '')) as Json;
    const move = (i: number, d: number) => {
      const next = [...value];
      const [item] = next.splice(i, 1);
      next.splice(i + d, 0, item as Json);
      onChange(next);
    };
    return (
      <fieldset className="space-y-3">
        <legend className="mb-2 font-display text-lg font-bold">{label(name)}</legend>
        {value.map((item, i) => (
          <div
            key={i}
            className={`flex gap-2 ${typeof item === 'object' && item ? 'rounded-xl border border-border p-4' : ''}`}
          >
            <div className="min-w-0 flex-1">
              <Node
                name={name === 'bio' ? 'bio' : singular(name)}
                value={item}
                api={api}
                onNotice={onNotice}
                onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))}
              />
            </div>
            <div className="flex shrink-0 flex-col gap-1 text-xs">
              <button
                type="button"
                aria-label="Move up"
                disabled={i === 0}
                className="rounded border border-border px-2 py-1 disabled:opacity-30"
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={i === value.length - 1}
                className="rounded border border-border px-2 py-1 disabled:opacity-30"
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label="Remove"
                className="rounded border border-border px-2 py-1 hover:border-accent hover:text-accent"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn-ghost !px-3 !py-1.5"
          onClick={() => onChange([...value, structuredClone(template)])}
        >
          + Add {name === 'bio' ? 'paragraph' : singular(label(name)).toLowerCase()}
        </button>
      </fieldset>
    );
  }

  // Objects
  if (value && typeof value === 'object') {
    return (
      <div
        className={heading ? 'space-y-3 rounded-xl border border-border p-4' : 'grid gap-3 md:grid-cols-2'}
      >
        {heading ? (
          <div className="flex items-center justify-between">
            <span className={onRemove ? 'font-mono text-sm font-semibold' : 'font-display text-lg font-bold'}>
              {heading}
            </span>
            {onRemove ? (
              <button type="button" className="text-xs text-muted hover:text-accent" onClick={onRemove}>
                Remove
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={heading ? 'grid gap-3 md:grid-cols-2' : 'contents'}>
          {Object.entries(value).map(([k, v]) => (
            <div key={k} className={Array.isArray(v) || LONG.has(k) ? 'md:col-span-2' : ''}>
              <Node
                name={k}
                value={v}
                api={api}
                onNotice={onNotice}
                onChange={(next) => onChange({ ...value, [k]: next })}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Leaves
  const isItem = name === 'bio' || name === 'item' || name === 'tag' || name.endsWith('Line');
  const control =
    typeof value === 'boolean' ? (
      <input
        id={id}
        type="checkbox"
        className="size-5 accent-[var(--accent)]"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    ) : CHOICES[name] ? (
      <select
        id={id}
        className="input !py-2"
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
      >
        {CHOICES[name]!.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    ) : LONG.has(name) || (typeof value === 'string' && value.length > 90) ? (
      <textarea
        id={id}
        className="input"
        rows={name === 'bio' ? 4 : 2}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    ) : name === 'image' ? (
      <span className="flex flex-wrap items-center gap-2">
        <input
          id={id}
          className="input !py-2 flex-1"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
        <UploadButton
          api={api}
          kind="public-image"
          accept="image/*"
          label="Upload"
          onUploaded={(ref) => onChange(ref)}
          onNotice={onNotice}
        />
      </span>
    ) : (
      <input
        id={id}
        className="input !py-2"
        value={String(value ?? '')}
        onChange={(e) => onChange(typeof value === 'number' ? Number(e.target.value) : e.target.value)}
      />
    );
  if (isItem) return control;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label(name)}
      </label>
      {control}
    </div>
  );
}

function singular(name: string): string {
  const n = name.toLowerCase();
  if (n === 'bio') return 'bio';
  if (n === 'skill groups' || n === 'skillgroups') return 'skill group';
  if (n === 'timeline') return 'timeline entry';
  return name.endsWith('s') ? name.slice(0, -1) : name;
}
