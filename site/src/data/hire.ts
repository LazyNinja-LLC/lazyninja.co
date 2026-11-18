/**
 * LazyNinja LLC services, stored in src/content/settings/hire.json so they can be edited at
 * /stats → Edit site → Hire. Set a service's `price` (e.g. "From $X") to show pricing;
 * leave it empty to hide it.
 */
import { z } from 'astro/zod';
import raw from '../content/settings/hire.json';

const HireSchema = z.object({
  services: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      bullets: z.array(z.string()),
      icon: z.enum(['web', 'ai', 'tools']),
      price: z.string().default(''),
    }),
  ),
  steps: z.array(z.object({ title: z.string(), text: z.string() })),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
});

export type Service = z.infer<typeof HireSchema>['services'][number];

export const { services, steps, faq } = HireSchema.parse(raw);
