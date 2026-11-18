/**
 * About page content, stored in src/content/settings/about.json so it can be edited at
 * /stats → Edit site → About. Validated here; a bad edit fails the build (and never deploys).
 * Everything marked TODO is a placeholder: replace it with real details, nothing invented.
 */
import { z } from 'astro/zod';
import raw from '../content/settings/about.json';

const AboutSchema = z.object({
  bio: z.array(z.string()),
  location: z.string(),
  skillGroups: z.array(
    z.object({ title: z.string(), items: z.array(z.string()), placeholder: z.boolean().default(false) }),
  ),
  timeline: z.array(
    z.object({
      when: z.string(),
      title: z.string(),
      text: z.string(),
      placeholder: z.boolean().default(false),
    }),
  ),
});

export type SkillGroup = z.infer<typeof AboutSchema>['skillGroups'][number];
export type TimelineItem = z.infer<typeof AboutSchema>['timeline'][number];

export const { bio, location, skillGroups, timeline } = AboutSchema.parse(raw);
