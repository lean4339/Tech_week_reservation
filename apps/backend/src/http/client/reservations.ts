import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../auth/middleware.js';
import type {
  ReservationsStore,
  ReservationInput,
} from '../../modules/reservations/model.js';
import type { Period } from '../../modules/shared/period.js';
import { reservationsService } from '../../modules/reservations/service.js';
import * as schema from '../../modules/reservations/schemas.js';
import {
  idSchema,
  periodSchema,
  emptyBodySchema,
} from '../../modules/shared/schemas.js';
type Id = { id: string };
export function clientReservationRoutes(
  app: FastifyInstance,
  store: ReservationsStore,
  auth: AuthMiddleware,
) {
  const service = reservationsService(store);
  const path = '/reservations';
  app.addHook('onRequest', auth.requirePermission('reservations:own'));
  app.get<{ Querystring: schema.ReservationsQuery }>(
    path,
    {
      schema: {
        querystring: schema.reservationsQuerySchema,
      },
    },
    async (request) => ({
      reservations: await service.reservations(request.query, {
        ownerId: request.user!.id,
      }),
    }),
  );
  app.get<{ Params: Id }>(
    `${path}/:id`,
    {
      schema: { params: idSchema },
    },
    async (request) => ({
      reservation: await service.reservation(request.params.id, {
        ownerId: request.user!.id,
      }),
    }),
  );
  app.post<{ Body: ReservationInput }>(
    path,
    {
      schema: {
        body: schema.reservationCreateSchema,
      },
    },
    async (request, reply) =>
      reply.code(201).send({
        reservation: await service.createReservation(
          request.body,
          request.user!.id,
        ),
      }),
  );
  app.patch<{ Params: Id; Body: Period }>(
    `${path}/:id`,
    {
      schema: { params: idSchema, body: periodSchema },
    },
    async (request) => ({
      reservation: await service.updateReservation(
        request.params.id,
        request.body,
        { ownerId: request.user!.id },
      ),
    }),
  );
  app.delete<{ Params: Id }>(
    `${path}/:id`,
    {
      schema: { params: idSchema, body: emptyBodySchema },
    },
    async (request) => ({
      reservation: await service.cancelReservation(request.params.id, {
        ownerId: request.user!.id,
      }),
    }),
  );
}
