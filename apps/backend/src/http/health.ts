import type { FastifyInstance } from 'fastify';

export function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_request, reply) => {
    try {
      await Promise.all([app.pg.query('SELECT 1'), app.redis.ping()]);
      return { status: 'ok' };
    } catch {
      app.log.error('No se pudo verificar PostgreSQL o Redis');
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
}
