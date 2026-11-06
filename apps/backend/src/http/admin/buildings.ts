import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../auth/middleware.js';
import type {
  BuildingsStore,
  BuildingInput,
} from '../../modules/buildings/model.js';
import { buildingsService } from '../../modules/buildings/service.js';
import * as schema from '../../modules/buildings/schemas.js';
import { idSchema, emptyBodySchema } from '../../modules/shared/schemas.js';
type Id = { id: string };
export function adminBuildingsRoutes(
  app: FastifyInstance,
  store: BuildingsStore,
  auth: AuthMiddleware,
) {
  const service = buildingsService(store);
  app.post<{ Body: BuildingInput }>(
    '/buildings',
    {
      onRequest: auth.requirePermission('buildings:write'),
      schema: { body: schema.buildingCreateSchema },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send({ building: await service.createBuilding(request.body) }),
  );
  app.patch<{ Params: Id; Body: Partial<BuildingInput> }>(
    '/buildings/:id',
    {
      onRequest: auth.requirePermission('buildings:write'),
      schema: { params: idSchema, body: schema.buildingUpdateSchema },
    },
    async (request) => ({
      building: await service.updateBuilding(request.params.id, request.body),
    }),
  );
  app.delete<{ Params: Id }>(
    '/buildings/:id',
    {
      onRequest: auth.requirePermission('buildings:write'),
      schema: { params: idSchema, body: emptyBodySchema },
    },
    async (request) => ({
      building: await service.deactivateBuilding(request.params.id),
    }),
  );
}
