import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../auth/middleware.js';
import { metricsPeriod } from '../../modules/metrics/period.js';
import { availabilityQuerySchema } from '../../modules/shared/schemas.js';
import type {
  MetricsPeriod,
  MetricsService,
} from '../../modules/metrics/model.js';
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
