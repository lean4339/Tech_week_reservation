import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../auth/middleware.js';
import type { BuildingsStore } from '../../modules/buildings/model.js';
import { buildingsService } from '../../modules/buildings/service.js';
import * as schema from '../../modules/buildings/schemas.js';
import { idSchema } from '../../modules/shared/schemas.js';
import type { PageQuery } from '../../modules/shared/pagination.js';
type Id = { id: string };
export function catalogBuildingsRoutes(
  app: FastifyInstance,
  store: BuildingsStore,
  auth: AuthMiddleware,
) {
  const service = buildingsService(store);
  app.get<{ Querystring: PageQuery }>(
    '/buildings',
    {
      onRequest: auth.requirePermission('buildings:read'),
      schema: { querystring: schema.buildingsQuerySchema },
    },
    async (request) => ({
      buildings: await service.buildings(
        request.query,
        request.user!.permissions.includes('buildings:write'),
      ),
    }),
  );
  app.get<{ Params: Id }>(
    '/buildings/:id',
    {
      onRequest: auth.requirePermission('buildings:read'),
      schema: { params: idSchema },
    },
    async (request) => ({
      building: await service.building(
        request.params.id,
        request.user!.permissions.includes('buildings:write'),
      ),
    }),
  );
}
