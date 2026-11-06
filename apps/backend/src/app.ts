import Fastify from 'fastify';
import postgres from '@fastify/postgres';
import redis from '@fastify/redis';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  });

  app.register(postgres, {
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://tech_week:tech_week_local@127.0.0.1:5432/tech_week',
    connectionTimeoutMillis: 5000,
  });

  app.register(redis, {
    url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
  });

  app.get('/health', async (_request, reply) => {
    try {
      await Promise.all([app.pg.query('SELECT 1'), app.redis.ping()]);
      return { status: 'ok' };
    } catch (error) {
      app.log.error(error, 'No se pudo verificar PostgreSQL o Redis');
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  return app;
}
