import { useRef, useState, type ReactNode } from 'react';
import type { AdminApi } from './api';

export type Notice = { kind: 'ok' | 'error' | 'info'; text: string } | null;

export function NoticeBar({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const tone =
    notice.kind === 'ok'
      ? 'border-shipped/50'
      : notice.kind === 'error'
        ? 'border-accent/60'
        : 'border-border';
  return (
    <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`card ${tone} p-3 text-sm`}>
      {notice.text}
    </p>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

/** Comma-separated list input for string arrays (tags, stack). */
export function ListInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  return (
    <input
      className="input !py-2"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }}
      placeholder="comma, separated"
    />
  );
}

/** File picker that uploads straight to the repo and reports the reference to use. */
export function UploadButton({
  api,
  kind,
  accept,
  label,
  onUploaded,
  onNotice,
}: {
  api: AdminApi;
  kind: 'resume' | 'image' | 'public-image';
  accept: string;
  label: string;
  onUploaded: (ref: string) => void;
  onNotice: (n: Notice) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          onNotice({ kind: 'info', text: `Uploading ${file.name}…` });
          try {
            const res = await api.upload(kind, file);
            onUploaded(res.ref);
            onNotice({ kind: 'ok', text: `Uploaded ${file.name}. It goes live with the next deploy.` });
          } catch (err) {
            onNotice({ kind: 'error', text: (err as Error).message });
          } finally {
            setBusy(false);
          }
        }}
      />
      <button
        type="button"
        className="btn-ghost !px-3 !py-1.5"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? 'Uploading…' : label}
      </button>
    </>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
