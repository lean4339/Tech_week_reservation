import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import redisPlugin from '@fastify/redis';

export async function connectRedis(scope: FastifyInstance, client: Redis) {
  let initialError: Error | undefined;
  let connected = false;
  client.on('error', (error: Error) => {
    if (!connected && !initialError) initialError = error;
    scope.log.warn('Redis connection unavailable');
  });
  // Unlike QUIT, disconnect works even when the initial connection failed.
  scope.addHook('onClose', async () => {
    client.disconnect();
  });
  try {
    await client.connect();
    connected = true;
    initialError = undefined;
  } catch (error) {
    // ioredis may reject with "Connection is closed" after emitting the actual cause.
    throw initialError ?? error;
  }
  await scope.register(redisPlugin, { client, closeClient: false });
}
