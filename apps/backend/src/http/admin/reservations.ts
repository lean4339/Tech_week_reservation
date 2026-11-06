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
export function adminReservationRoutes(
  app: FastifyInstance,
  store: ReservationsStore,
  auth: AuthMiddleware,
) {
  const service = reservationsService(store);
  const path = '/admin/reservations';
  app.addHook('onRequest', auth.requirePermission('reservations:manage'));
  app.get<{ Querystring: schema.ReservationsQuery }>(
    path,
    {
      schema: {
        querystring: schema.adminReservationsQuerySchema,
      },
    },
    async (request) => ({
      reservations: await service.reservations(request.query, { admin: true }),
    }),
  );
  app.get<{ Params: Id }>(
    `${path}/:id`,
    {
      schema: { params: idSchema },
    },
    async (request) => ({
      reservation: await service.reservation(request.params.id, {
        admin: true,
      }),
    }),
  );
  app.post<{ Body: ReservationInput & { userId: string } }>(
    path,
    {
      schema: {
        body: schema.adminReservationCreateSchema,
      },
    },
    async (request, reply) =>
      reply.code(201).send({
        reservation: await service.createReservation(
          request.body,
          request.body.userId,
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
        { admin: true },
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
        admin: true,
      }),
    }),
  );
}
