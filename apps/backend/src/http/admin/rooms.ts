import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../auth/middleware.js';
import type { RoomsStore, RoomInput } from '../../modules/rooms/model.js';
import { roomsService } from '../../modules/rooms/service.js';
import * as schema from '../../modules/rooms/schemas.js';
import { idSchema, emptyBodySchema } from '../../modules/shared/schemas.js';
type Id = { id: string };
export function adminRoomsRoutes(
  app: FastifyInstance,
  store: RoomsStore,
  auth: AuthMiddleware,
) {
  const service = roomsService(store);
  app.post<{ Body: RoomInput }>(
    '/rooms',
    {
      onRequest: auth.requirePermission('rooms:write'),
      schema: { body: schema.roomCreateSchema },
    },
    async (request, reply) =>
      reply.code(201).send({ room: await service.createRoom(request.body) }),
  );
  app.patch<{ Params: Id; Body: Partial<RoomInput> }>(
    '/rooms/:id',
    {
      onRequest: auth.requirePermission('rooms:write'),
      schema: { params: idSchema, body: schema.roomUpdateSchema },
    },
    async (request) => ({
      room: await service.updateRoom(request.params.id, request.body),
    }),
  );
  app.delete<{ Params: Id }>(
    '/rooms/:id',
    {
      onRequest: auth.requirePermission('rooms:write'),
      schema: { params: idSchema, body: emptyBodySchema },
    },
    async (request) => ({
      room: await service.deactivateRoom(request.params.id),
    }),
  );
}
