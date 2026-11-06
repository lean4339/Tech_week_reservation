import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../auth/middleware.js';
import type { UserStore, SecurityStore } from '../../auth/model.js';
import type { ProductStores } from '../../modules/stores.js';
import type { MetricsService } from '../../modules/metrics/model.js';
import { adminBuildingsRoutes } from './buildings.js';
import { adminRoomsRoutes } from './rooms.js';
import { adminReservationRoutes } from './reservations.js';
import { adminClientRoutes } from './clients.js';
import { activityRoutes } from './activity.js';
import { metricsRoutes } from './metrics.js';

export async function registerAdminRoutes(
  app: FastifyInstance,
  auth: AuthMiddleware,
  users: UserStore,
  security: SecurityStore,
  product?: ProductStores,
  metrics?: MetricsService,
) {
  // All administrative operations share this boundary, including legacy /rooms
  // and /buildings writes. Resource permissions further restrict each operation.
  app.addHook('onRequest', auth.requirePermission('admin:read'));
  activityRoutes(app, users, security, auth);
  if (metrics) metricsRoutes(app, auth, metrics);
  if (product) {
    adminBuildingsRoutes(app, product.buildings, auth);
    adminRoomsRoutes(app, product.rooms, auth);
    adminClientRoutes(app, product.clients, auth);
    app.register(async (reservations) =>
      adminReservationRoutes(reservations, product.reservations, auth),
    );
  }
}
