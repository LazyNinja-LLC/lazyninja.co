/**
 * Home page copy (hero, about teaser, contact band), stored in src/content/settings/home.json so
 * it can be edited at /stats → Edit site → Home.
 * `titleLines` are shown one per line; the last line is set in italics.
 * Validated here; a bad edit fails the build (and never deploys).
 */
import { z } from 'astro/zod';
import raw from '../content/settings/home.json';

const lines = z.array(z.string().min(1)).min(1);

const HomeSchema = z.object({
  hero: z.object({
    kicker: z.string(),
    titleLines: lines,
    lede: z.string(),
    nightKicker: z.string(),
    nightTitleLines: lines,
    nightLede: z.string(),
    primaryButton: z.string().min(1),
    secondaryButton: z.string().min(1),
  }),
  about: z.object({
    kicker: z.string(),
    greeting: z.string(),
    name: z.string().min(1),
    lead: z.string(),
    /** Optional second paragraph; empty = the second paragraph of the About bio. */
    text: z.string().default(''),
    /** Caption under the Lego polaroid. */
    photoCaption: z.string().default('Off the mat'),
  }),
  contact: z.object({
    kicker: z.string(),
    titleLines: lines,
    nightKicker: z.string(),
    nightTitleLines: lines,
    text: z.string(),
    button: z.string().min(1),
  }),
});

export const home = HomeSchema.parse(raw);
