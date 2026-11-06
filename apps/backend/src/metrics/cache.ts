import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import type {
  Metrics,
  MetricsCache,
  MetricsPeriod,
  MetricsService,
  MetricsStore,
} from './model.js';
export const METRICS_TTL_SECONDS = 60;
export function metricsKey(revision: string, period: MetricsPeriod) {
  const digest = createHash('sha256')
    .update(JSON.stringify([period.from, period.to]))
    .digest('hex');
  return `tech-week:metrics:v1:${revision}:${digest}`;
}
export function redisMetrics(redis: Redis): MetricsCache {
  return {
    async get(key) {
      const value = await redis.get(key);
      if (!value) return null;
      const parsed = JSON.parse(value) as Metrics;
      if (
        !parsed ||
        parsed.timezone !== 'UTC' ||
        !parsed.summary ||
        !Array.isArray(parsed.days)
      )
        return null;
      return parsed;
    },
    async set(key, metrics) {
      await redis.set(key, JSON.stringify(metrics), 'EX', METRICS_TTL_SECONDS);
    },
  };
}
export function metricsService(
  store: MetricsStore,
  cache: MetricsCache,
): MetricsService {
  const inFlight = new Map<string, Promise<Metrics>>();
  return {
    async get(period) {
      // Revision is read from PostgreSQL before every cache lookup. The revision
      // bump commits atomically with business writes; Redis is never authoritative.
      const key = metricsKey(await store.revision(), period);
      try {
        const hit = await cache.get(key);
        if (
          hit &&
          hit.period.from === period.from &&
          hit.period.to === period.to
        )
          return hit;
      } catch {
        /* Cache failures must not discard valid PostgreSQL results. */
      }
      const pending = inFlight.get(key);
      if (pending) return pending;
      const calculation = (async () => {
        const snapshot = await store.calculate(period);
        try {
          await cache.set(
            metricsKey(snapshot.revision, period),
            snapshot.metrics,
          );
        } catch {
          /* TTL cache is optional; authentication still fails closed. */
        }
        return snapshot.metrics;
      })();
      inFlight.set(key, calculation);
      try {
        return await calculation;
      } finally {
        inFlight.delete(key);
      }
    },
  };
}
