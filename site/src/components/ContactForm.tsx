import { useEffect, useRef, useState, type SubmitEvent } from 'react';

export interface ContactFormProps {
  apiUrl: string;
  email: string;
}

type Reason = 'general' | 'hire' | 'recruiting';
type Status = 'idle' | 'sending' | 'success' | 'error';
type Errors = Partial<Record<'name' | 'email' | 'message', string>>;

const REASONS: [Reason, string][] = [
  ['general', 'General'],
  ['hire', 'Hire'],
  ['recruiting', 'Recruiting'],
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors the API's zod schema (api/src/lib/contact-schema.ts). */
export function validate(values: { name: string; email: string; message: string }): Errors {
  const errors: Errors = {};
  if (values.name.trim().length < 2) errors.name = 'Please enter your name.';
  else if (values.name.length > 100) errors.name = 'Name is too long.';
  if (!EMAIL_RE.test(values.email.trim())) errors.email = 'Please enter a valid email address.';
  if (values.message.trim().length < 10) errors.message = 'A little more detail, please (10+ characters).';
  else if (values.message.length > 5000) errors.message = 'Message is too long (5,000 characters max).';
  return errors;
}

export default function ContactForm({ apiUrl, email }: ContactFormProps) {
  const [hydrated, setHydrated] = useState(false);
  const [apiDown, setApiDown] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState('');
  const [reason, setReason] = useState<Reason>('general');
  const startedAt = useRef(Date.now());
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHydrated(true);
    startedAt.current = Date.now();
    const r = new URLSearchParams(location.search).get('reason');
    if (r === 'hire' || r === 'recruiting' || r === 'general') setReason(r);

    // Check the API is up; if not, show the mailto fallback up front.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    fetch(`${apiUrl}/health`, { signal: controller.signal })
      .then((res) => setApiDown(!res.ok))
      .catch(() => setApiDown(true))
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [apiUrl]);

  useEffect(() => {
    if (status === 'success' || status === 'error') statusRef.current?.focus();
  }, [status]);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const values = {
      name: String(data.get('name') ?? ''),
      email: String(data.get('email') ?? ''),
      reason: String(data.get('reason') ?? 'general'),
      message: String(data.get('message') ?? ''),
      website: String(data.get('website') ?? ''), // honeypot
    };
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0];
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }

    setStatus('sending');
    setServerError('');
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${apiUrl}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, startedAt: startedAt.current }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        setStatus('success');
        formRef.current?.reset();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setServerError(
        res.status === 429
          ? 'Too many messages from your network. Please try again later, or email directly.'
          : (body?.error ?? 'Something went wrong on our side.'),
      );
      setStatus('error');
      if (res.status >= 500) setApiDown(true);
    } catch {
      setServerError('Could not reach the server.');
      setApiDown(true);
      setStatus('error');
    }
  }

  const mailto = `mailto:${email}?subject=${encodeURIComponent('Hello from lazyninja.co')}`;

  if (status === 'success') {
    return (
      <div ref={statusRef} tabIndex={-1} role="status" className="card border-shipped/50 p-8">
        <p className="font-display text-2xl font-bold">Message sent. 🥷</p>
        <p className="mt-2 text-muted">Thanks for reaching out. You'll hear back by email soon.</p>
        <button type="button" className="link mt-4 text-sm" onClick={() => setStatus('idle')}>
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5" aria-describedby="form-note">
      {apiDown ? (
        <div role="alert" className="card border-building/50 p-4 text-sm">
          The contact form is having a nap right now. Email{' '}
          <a className="link" href={mailto}>
            {email}
          </a>{' '}
          instead, it goes to the same inbox.
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" name="name" error={errors.name} autoComplete="name" required />
        <Field label="Email" name="email" type="email" error={errors.email} autoComplete="email" required />
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Reason</span>
        <select
          name="reason"
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value as Reason)}
        >
          {REASONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <Field label="Message" name="message" textarea error={errors.message} required />

      {/* Honeypot: hidden from people and assistive tech, tempting to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {status === 'error' ? (
        <div ref={statusRef} tabIndex={-1} role="alert" className="card border-accent/50 p-4 text-sm">
          <p className="font-semibold">{serverError}</p>
          <p className="mt-1 text-muted">
            You can also email{' '}
            <a className="link" href={mailto}>
              {email}
            </a>
            .
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          className="btn-primary disabled:opacity-60"
          disabled={!hydrated || status === 'sending'}
        >
          {status === 'sending' ? 'Sending…' : 'Send message'}
        </button>
        <p id="form-note" className="text-xs text-muted">
          Prefer email?{' '}
          <a className="link" href={mailto}>
            {email}
          </a>
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = 'text',
  error,
  textarea = false,
  required = false,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  error?: string | undefined;
  textarea?: boolean;
  required?: boolean;
  autoComplete?: string;
}) {
  const id = `field-${name}`;
  const errorId = `${id}-error`;
  const common = {
    id,
    name,
    required,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    className: `input ${error ? '!border-accent' : ''}`,
  };
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </label>
      {textarea ? (
        <textarea {...common} rows={6} maxLength={5000} />
      ) : (
        <input {...common} type={type} autoComplete={autoComplete} maxLength={type === 'email' ? 254 : 100} />
      )}
      {error ? (
        <p id={errorId} className="text-sm text-accent">
          {error}
        </p>
      ) : null}
    </div>
  );
}
