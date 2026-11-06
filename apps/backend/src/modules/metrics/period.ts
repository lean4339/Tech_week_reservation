import { validatePeriod } from '../shared/period.js';
import type { MetricsPeriod } from './model.js';
export function metricsPeriod(
  query: Partial<MetricsPeriod>,
  now = new Date(),
): MetricsPeriod {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  const period = validatePeriod({
    startsAt:
      query.from ?? new Date(end.getTime() - 30 * 86400000).toISOString(),
    endsAt: query.to ?? end.toISOString(),
  });
  return { from: period.startsAt, to: period.endsAt };
}
