import type { MetricsService } from './modules/metrics/model.js';
import type { ProductStores } from './modules/stores.js';
import Fastify from 'fastify';
import { authConfig } from './auth/config.js';
import type { SecurityStore, UserStore } from './auth/model.js';
import { registerPostgres, connectStores } from './db/plugins.js';
import { serverOptions } from './http/options.js';
import { registerHttpSecurity } from './http/security.js';
import { registerRequestAudit } from './http/request-audit.js';
import { registerApi } from './http/routes.js';
import { healthRoutes } from './http/health.js';

export function buildApp(
  options: {
    stores?: {
      users: UserStore;
      security: SecurityStore;
      product?: ProductStores;
      metrics?: MetricsService;
    };
    logger?: boolean;
  } = {},
) {
  const config = authConfig();
  const app = Fastify(serverOptions(options.logger));
  let security = options.stores?.security;
  registerHttpSecurity(app, config);
  registerRequestAudit(app, () => security);

  if (!options.stores) registerPostgres(app);
  app.register(async (scope) => {
    const stores = options.stores ?? (await connectStores(scope));
    security = stores.security;
    scope.register(async (api) =>
      registerApi(
        api,
        stores.users,
        stores.security,
        config,
        stores.product,
        stores.metrics,
      ),
    );
    if (!options.stores) healthRoutes(scope);
  });
  return app;
}
