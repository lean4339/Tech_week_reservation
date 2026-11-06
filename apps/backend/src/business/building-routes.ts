import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../auth/middleware.js';
import type { BusinessStore, BuildingInput } from './model.js';
import { businessService } from './service.js';
import * as schema from './schemas.js';

type Id = { id: string };
export function buildingRoutes(
  app: FastifyInstance,
  store: BusinessStore,
  auth: AuthMiddleware,
) {
  const service = businessService(store);
  app.get<{ Querystring: schema.PageQuery }>(
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
      schema: { params: schema.idSchema },
    },
    async (request) => ({
      building: await service.building(
        request.params.id,
        request.user!.permissions.includes('buildings:write'),
      ),
    }),
  );
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
      schema: { params: schema.idSchema, body: schema.buildingUpdateSchema },
    },
    async (request) => ({
      building: await service.updateBuilding(request.params.id, request.body),
    }),
  );
  app.delete<{ Params: Id }>(
    '/buildings/:id',
    {
      onRequest: auth.requirePermission('buildings:write'),
      schema: { params: schema.idSchema, body: schema.emptyBodySchema },
    },
    async (request) => ({
      building: await service.deactivateBuilding(request.params.id),
    }),
  );
}
