/** Page views are kept for 13 months, then purged by `npm run sync`. */
export const RETENTION_MONTHS = 13;

export function retentionCutoff(now: Date, months = RETENTION_MONTHS): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}
