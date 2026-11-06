import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import redisPlugin from '@fastify/redis';

export async function connectRedis(scope: FastifyInstance, client: Redis) {
  client.on('error', () => scope.log.warn('Redis connection unavailable'));
  // Unlike QUIT, disconnect works even when the initial connection failed.
  scope.addHook('onClose', async () => {
    client.disconnect();
  });
  await client.connect();
  await scope.register(redisPlugin, { client, closeClient: false });
}
