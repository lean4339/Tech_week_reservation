import Fastify, { type FastifyError } from 'fastify';
import postgres from '@fastify/postgres';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { authConfig } from './auth/config.js';
import { authRoutes } from './auth/routes.js';
import { postgresUsers, redisSecurity } from './auth/stores.js';
import { PasswordBusyError } from './auth/password.js';
import type { SecurityStore, UserStore } from './auth/model.js';
import { connectRedis } from './db/redis.js';

export function buildApp(
  options: {
    stores?: { users: UserStore; security: SecurityStore };
    logger?: boolean;
  } = {},
) {
  const config = authConfig();
  let requestAudit = options.stores?.security;
  const app = Fastify({
    trustProxy: false,
    bodyLimit: 4096,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: false,
        useDefaults: false,
      },
    },
    logger:
      options.logger === false
        ? false
        : {
            level: process.env.LOG_LEVEL ?? 'info',
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
            ],
            serializers: {
              req: (req) => ({
                method: req.method,
                route: req.routeOptions?.url ?? '/unmatched',
              }),
            },
          },
  });

  app.addHook('onResponse', async (request, reply) => {
    if (!requestAudit) return;
    const record = {
      requestId: request.id,
      time: new Date().toISOString(),
      ip: request.ip,
      ipSource: 'socket' as const,
      method: request.method,
      route: request.routeOptions.url ?? '/unmatched',
      status: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime * 1000) / 1000,
    };
    try {
      await requestAudit.logRequest(record);
    } catch {
      // Response has already been sent. Preserve metadata locally, never the body or query.
      app.log.error(
        { event: 'request_audit_failed', request: record },
        'Redis request audit unavailable',
      );
    }
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'",
    );
    if (config.secureCookies)
      reply.header('Strict-Transport-Security', 'max-age=31536000');
  });
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.validation || error.statusCode === 400)
      return reply.code(400).send({ message: 'Datos inválidos.' });
    if (error.statusCode === 413)
      return reply.code(413).send({ message: 'Solicitud demasiado grande.' });
    if (error instanceof PasswordBusyError)
      return reply
        .header('Retry-After', 5)
        .code(429)
        .send({ message: 'Servicio ocupado. Intentá más tarde.' });
    // Never serialize DB errors: they can include emails, hashes or connection strings.
    app.log.error({ requestId: request.id }, 'Request failed');
    return reply
      .code(503)
      .send({ message: 'Servicio no disponible. Intentá más tarde.' });
  });

  if (options.stores) {
    const { users, security } = options.stores;
    app.register(async (scope) => authRoutes(scope, users, security, config));
    return app;
  }

  app.register(postgres, {
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://tech_week:tech_week_local@127.0.0.1:5432/tech_week',
    connectionTimeoutMillis: 5000,
  });

  app.register(async (scope) => {
    const client = new Redis(
      process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
      {
        lazyConnect: true,
        connectTimeout: 5000,
        commandTimeout: 5000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: (attempt) => (attempt <= 3 ? 100 * attempt : null),
      },
    );
    await connectRedis(scope, client);
    requestAudit = redisSecurity(scope.redis);
    scope.register(async (routes) =>
      authRoutes(
        routes,
        postgresUsers(scope.pg.pool),
        redisSecurity(scope.redis),
        config,
      ),
    );
    scope.get('/health', async (_request, reply) => {
      try {
        await Promise.all([scope.pg.query('SELECT 1'), scope.redis.ping()]);
        return { status: 'ok' };
      } catch {
        scope.log.error('No se pudo verificar PostgreSQL o Redis');
        return reply.code(503).send({ status: 'unavailable' });
      }
    });
  });

  return app;
}
