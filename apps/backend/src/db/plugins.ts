import { postgresMetrics } from '../modules/metrics/store.js';
import { metricsService, redisMetrics } from '../modules/metrics/cache.js';
import type { FastifyInstance } from 'fastify';
import postgres from '@fastify/postgres';
import { Redis } from 'ioredis';
import { postgresUsers, redisSecurity } from '../auth/stores.js';
import { postgresProduct } from './product-stores.js';
import { connectRedis } from './redis.js';

export function registerPostgres(app: FastifyInstance) {
  app.register(postgres, {
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://tech_week:tech_week_local@127.0.0.1:5432/tech_week',
    connectionTimeoutMillis: 5000,
  });
}

export async function connectStores(app: FastifyInstance) {
  const client = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    lazyConnect: true,
    connectTimeout: 5000,
    commandTimeout: 5000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (attempt) => (attempt <= 3 ? 100 * attempt : null),
  });
  await connectRedis(app, client);
  return {
    users: postgresUsers(app.pg.pool),
    product: postgresProduct(app.pg.pool),
    metrics: metricsService(
      postgresMetrics(app.pg.pool),
      redisMetrics(app.redis),
    ),
    security: redisSecurity(app.redis),
  };
}
