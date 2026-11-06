import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../auth/middleware.js';
import type { ClientsStore } from '../../modules/clients/model.js';
import type { PageQuery } from '../../modules/shared/pagination.js';
import { clientsQuerySchema } from '../../modules/clients/schemas.js';
export function adminClientRoutes(
  app: FastifyInstance,
  store: ClientsStore,
  auth: AuthMiddleware,
) {
  app.get<{ Querystring: PageQuery & { search?: string } }>(
    '/admin/clients',
    {
      onRequest: auth.requirePermission('reservations:manage'),
      schema: { querystring: clientsQuerySchema },
    },
    async (request) => ({
      clients: await store.clients(
        {
          limit: Number(request.query.limit ?? 50),
          offset: Number(request.query.offset ?? 0),
        },
        (request.query.search ?? '').trim(),
      ),
    }),
  );
}
