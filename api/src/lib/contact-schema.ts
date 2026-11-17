import { z } from 'zod';

/** Minimum time between page load and submit. Faster than this is almost certainly a bot. */
export const MIN_FILL_MS = 3000;

const noNewlines = (s: string) => !/[\r\n]/.test(s);

export const ContactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Please enter your name.')
    .max(100, 'Name is too long.')
    .refine(noNewlines, 'Name must be a single line.'),
  email: z.string().trim().max(254).pipe(z.email('Please enter a valid email address.')),
  reason: z.enum(['general', 'hire', 'recruiting']).default('general'),
  message: z
    .string()
    .trim()
    .min(10, 'A little more detail, please (10+ characters).')
    .max(5000, 'Message is too long (5,000 characters max).'),
  /** Honeypot: real people never fill this in. */
  website: z.string().max(500).optional().default(''),
  /** Client timestamp (ms) from page load. */
  startedAt: z.number().int().positive(),
});

export type ContactInput = z.infer<typeof ContactSchema>;

export type ContactCheck =
  | { ok: true; data: ContactInput }
  | { ok: false; kind: 'invalid'; errors: Record<string, string> }
  | { ok: false; kind: 'honeypot' }
  | { ok: false; kind: 'too-fast' };

/** Validates the payload, then the anti-spam checks (honeypot, minimum fill time). */
export function checkContact(payload: unknown, now: number = Date.now()): ContactCheck {
  const parsed = ContactSchema.safeParse(payload);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      errors[key] ??= issue.message;
    }
    return { ok: false, kind: 'invalid', errors };
  }
  if (parsed.data.website.trim() !== '') return { ok: false, kind: 'honeypot' };
  if (now - parsed.data.startedAt < MIN_FILL_MS) return { ok: false, kind: 'too-fast' };
  return { ok: true, data: parsed.data };
}

export const REASON_LABELS: Record<ContactInput['reason'], string> = {
  general: 'General',
  hire: 'Hire',
  recruiting: 'Recruiting',
};
