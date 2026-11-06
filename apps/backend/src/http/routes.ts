import type { BusinessStore } from '../business/model.js';
import { businessRoutes } from '../business/routes.js';
import type { FastifyInstance } from 'fastify';
import type { AuthConfig } from '../auth/config.js';
import type { SecurityStore, UserStore } from '../auth/model.js';
import { registerAuthentication } from '../auth/middleware.js';
import { csrfProtection } from '../auth/csrf.js';
import { rateLimit } from '../auth/rate-limit.js';
import { profileRoutes, publicAuthRoutes } from '../auth/routes.js';
import { adminRoutes } from '../admin/routes.js';

export function registerApi(
  app: FastifyInstance,
  users: UserStore,
  security: SecurityStore,
  config: AuthConfig,
  business?: BusinessStore,
) {
  app.addHook('onRequest', csrfProtection(config));
  app.addHook(
    'onRequest',
    rateLimit(security, (request) => `requests:${request.ip}`, 120, 60),
  );
  const auth = registerAuthentication(app, users, security, config);
  publicAuthRoutes(app, users, security, config);

  app.register(async (protectedRoutes) => {
    // Every route in this scope authenticates before validation and handlers.
    protectedRoutes.addHook('onRequest', auth.authenticate);
    profileRoutes(protectedRoutes, auth);
    if (business) businessRoutes(protectedRoutes, business, auth);
    protectedRoutes.register(async (admin) => {
      admin.addHook('preHandler', auth.requirePermission('admin:read'));
      adminRoutes(admin, users, security, auth);
    });
  });
}
