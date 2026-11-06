import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../auth/middleware.js';
import type { BuildingsStore } from '../../modules/buildings/model.js';
import type { RoomsStore } from '../../modules/rooms/model.js';
import { catalogBuildingsRoutes } from './buildings.js';
import { catalogRoomsRoutes } from './rooms.js';

export async function registerCatalogRoutes(
  app: FastifyInstance,
  buildings: BuildingsStore,
  rooms: RoomsStore,
  auth: AuthMiddleware,
) {
  // Read-only catalog shared by authorized clients and administrators.
  catalogBuildingsRoutes(app, buildings, auth);
  catalogRoomsRoutes(app, rooms, auth);
}
