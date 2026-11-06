import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../auth/middleware.js';
import type {
  BusinessStore,
  Period,
  ReservationInput,
  ReservationScope,
  RoomInput,
} from './model.js';
import { buildingRoutes } from './building-routes.js';
import { businessService } from './service.js';
import * as schema from './schemas.js';

type Id = { id: string };
export function businessRoutes(
  app: FastifyInstance,
  store: BusinessStore,
  auth: AuthMiddleware,
) {
  const service = businessService(store);
  buildingRoutes(app, store, auth);
  app.get<{ Querystring: schema.PageQuery & { search?: string } }>(
    '/admin/clients',
    {
      onRequest: auth.requirePermission('reservations:manage'),
      schema: { querystring: schema.clientsQuerySchema },
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
  const readRooms = auth.requirePermission('rooms:read');
  const writeRooms = auth.requirePermission('rooms:write');
  app.get<{
    Querystring: schema.PageQuery &
      Partial<schema.PeriodQuery> & { buildingId?: string };
  }>(
    '/rooms',
    {
      onRequest: readRooms,
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
      onRequest: readRooms,
      schema: { params: schema.idSchema },
    },
    async (request) => ({
      room: await service.room(
        request.params.id,
        request.user!.permissions.includes('rooms:write'),
      ),
    }),
  );
  app.get<{ Params: Id; Querystring: schema.PeriodQuery }>(
    '/rooms/:id/availability',
    {
      onRequest: readRooms,
      schema: {
        params: schema.idSchema,
        querystring: schema.availabilityQuerySchema,
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
  app.post<{ Body: RoomInput }>(
    '/rooms',
    {
      onRequest: writeRooms,
      schema: { body: schema.roomCreateSchema },
    },
    async (request, reply) =>
      reply.code(201).send({ room: await service.createRoom(request.body) }),
  );
  app.patch<{ Params: Id; Body: Partial<RoomInput> }>(
    '/rooms/:id',
    {
      onRequest: writeRooms,
      schema: { params: schema.idSchema, body: schema.roomUpdateSchema },
    },
    async (request) => ({
      room: await service.updateRoom(request.params.id, request.body),
    }),
  );
  app.delete<{ Params: Id }>(
    '/rooms/:id',
    {
      onRequest: writeRooms,
      schema: { params: schema.idSchema, body: schema.emptyBodySchema },
    },
    async (request) => ({
      room: await service.deactivateRoom(request.params.id),
    }),
  );

  // Separate scopes prevent a client-supplied userId from selecting an admin policy.
  for (const admin of [false, true]) {
    app.register(async (reservations) => {
      reservations.addHook(
        'onRequest',
        auth.requirePermission(
          admin ? 'reservations:manage' : 'reservations:own',
        ),
      );
      const path = admin ? '/admin/reservations' : '/reservations';
      const scope = (userId: string): ReservationScope =>
        admin ? { admin: true } : { ownerId: userId };
      reservations.get<{ Querystring: schema.ReservationsQuery }>(
        path,
        {
          schema: {
            querystring: admin
              ? schema.adminReservationsQuerySchema
              : schema.reservationsQuerySchema,
          },
        },
        async (request) => ({
          reservations: await service.reservations(
            request.query,
            scope(request.user!.id),
          ),
        }),
      );
      reservations.get<{ Params: Id }>(
        `${path}/:id`,
        {
          schema: { params: schema.idSchema },
        },
        async (request) => ({
          reservation: await service.reservation(
            request.params.id,
            scope(request.user!.id),
          ),
        }),
      );
      reservations.post<{ Body: ReservationInput & { userId?: string } }>(
        path,
        {
          schema: {
            body: admin
              ? schema.adminReservationCreateSchema
              : schema.reservationCreateSchema,
          },
        },
        async (request, reply) =>
          reply.code(201).send({
            reservation: await service.createReservation(
              request.body,
              admin ? request.body.userId! : request.user!.id,
            ),
          }),
      );
      reservations.patch<{ Params: Id; Body: Period }>(
        `${path}/:id`,
        {
          schema: { params: schema.idSchema, body: schema.periodSchema },
        },
        async (request) => ({
          reservation: await service.updateReservation(
            request.params.id,
            request.body,
            scope(request.user!.id),
          ),
        }),
      );
      reservations.delete<{ Params: Id }>(
        `${path}/:id`,
        {
          schema: { params: schema.idSchema, body: schema.emptyBodySchema },
        },
        async (request) => ({
          reservation: await service.cancelReservation(
            request.params.id,
            scope(request.user!.id),
          ),
        }),
      );
    });
  }
}
