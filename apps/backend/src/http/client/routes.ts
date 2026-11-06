import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../auth/middleware.js';
import type { ReservationsStore } from '../../modules/reservations/model.js';
import { clientReservationRoutes } from './reservations.js';

export async function registerClientRoutes(
  app: FastifyInstance,
  store: ReservationsStore,
  auth: AuthMiddleware,
) {
  clientReservationRoutes(app, store, auth);
}
