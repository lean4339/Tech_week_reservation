import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../auth/middleware.js';
import { validatePeriod } from '../business/service.js';
import { availabilityQuerySchema } from '../business/schemas.js';
import type { MetricsPeriod, MetricsService } from './model.js';

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
export function metricsRoutes(
  app: FastifyInstance,
  auth: AuthMiddleware,
  service: MetricsService,
) {
  app.get<{ Querystring: Partial<MetricsPeriod> }>(
    '/admin/metrics',
    {
      onRequest: auth.requirePermission('admin:read'),
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: availabilityQuerySchema.properties,
          dependencies: { from: ['to'], to: ['from'] },
        },
      },
    },
    async (request) => service.get(metricsPeriod(request.query)),
  );
}
