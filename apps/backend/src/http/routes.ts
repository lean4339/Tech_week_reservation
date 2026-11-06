import type { FastifyInstance } from 'fastify';
import type { AuthConfig } from '../auth/config.js';
import type { SecurityStore, UserStore } from '../auth/model.js';
import type { ProductStores } from '../modules/stores.js';
import type { MetricsService } from '../modules/metrics/model.js';
import { registerAuthentication } from '../auth/middleware.js';
import { csrfProtection } from '../auth/csrf.js';
import { rateLimit } from '../auth/rate-limit.js';
import { profileRoutes, publicAuthRoutes } from '../auth/routes.js';
import { registerAdminRoutes } from './admin/routes.js';
import { registerClientRoutes } from './client/routes.js';
import { registerCatalogRoutes } from './catalog/routes.js';

export function registerApi(
  app: FastifyInstance,
  users: UserStore,
  security: SecurityStore,
  config: AuthConfig,
  product?: ProductStores,
  metrics?: MetricsService,
) {
  app.addHook('onRequest', csrfProtection(config));
  app.addHook(
    'onRequest',
    rateLimit(security, (request) => `requests:${request.ip}`, 120, 60),
  );
  const auth = registerAuthentication(app, users, security, config);
  publicAuthRoutes(app, users, security, config);
  app.register(async (protectedRoutes) => {
    // Fastify inheritance authenticates every child before validation or effects.
    protectedRoutes.addHook('onRequest', auth.authenticate);
    profileRoutes(protectedRoutes, auth);
    if (product) {
      protectedRoutes.register(async (catalog) =>
        registerCatalogRoutes(catalog, product.buildings, product.rooms, auth),
      );
      protectedRoutes.register(async (client) =>
        registerClientRoutes(client, product.reservations, auth),
      );
    }
    protectedRoutes.register(async (admin) =>
      registerAdminRoutes(admin, auth, users, security, product, metrics),
    );
  });
}
