import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../auth/middleware.js';
import type { SecurityStore, UserStore } from '../../auth/model.js';

export function activityRoutes(
  app: FastifyInstance,
  users: UserStore,
  security: SecurityStore,
  auth: AuthMiddleware,
) {
  app.get(
    '/admin/overview',
    {
      preHandler: auth.requirePermission('admin:read'),
    },
    async () => ({ users: await users.count() }),
  );
  app.get(
    '/admin/auth-events',
    {
      preHandler: auth.requirePermission('audit:read'),
    },
    async () => ({ events: await security.events() }),
  );
  app.get(
    '/admin/request-events',
    {
      preHandler: auth.requirePermission('audit:read'),
    },
    async () => ({ requests: await security.requests() }),
  );
}
