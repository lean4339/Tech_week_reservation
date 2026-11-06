import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../auth/middleware.js';
import type { RoomsStore } from '../../modules/rooms/model.js';
import { roomsService } from '../../modules/rooms/service.js';
import * as schema from '../../modules/rooms/schemas.js';
import {
  idSchema,
  availabilityQuerySchema,
} from '../../modules/shared/schemas.js';
import type { PageQuery } from '../../modules/shared/pagination.js';
import type { PeriodQuery } from '../../modules/shared/period.js';
type Id = { id: string };
export function catalogRoomsRoutes(
  app: FastifyInstance,
  store: RoomsStore,
  auth: AuthMiddleware,
) {
  const service = roomsService(store);
  app.get<{
    Querystring: PageQuery & Partial<PeriodQuery> & { buildingId?: string };
  }>(
    '/rooms',
    {
      onRequest: auth.requirePermission('rooms:read'),
      schema: { querystring: schema.roomsQuerySchema },
    },
    async (request) => ({
      rooms: await service.rooms(
        request.query,
        request.user!.permissions.includes('rooms:write'),
      ),
    }),
  );
  app.get<{ Params: Id }>(
    '/rooms/:id',
    {
      onRequest: auth.requirePermission('rooms:read'),
      schema: { params: idSchema },
    },
    async (request) => ({
      room: await service.room(
        request.params.id,
        request.user!.permissions.includes('rooms:write'),
      ),
    }),
  );
  app.get<{ Params: Id; Querystring: PeriodQuery }>(
    '/rooms/:id/availability',
    {
      onRequest: auth.requirePermission('rooms:read'),
      schema: {
        params: idSchema,
        querystring: availabilityQuerySchema,
      },
    },
    async (request) => ({
      available: await service.availability(
        request.params.id,
        request.query,
        request.user!.permissions.includes('rooms:write'),
      ),
    }),
  );
}
