import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SecurityStore } from './model.js';
import { writeAuthEvent } from './audit.js';

export function rateLimit(
  security: SecurityStore,
  key: (request: FastifyRequest) => string,
  limit: number,
  seconds: number,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (await security.consume(key(request), limit, seconds)) return;
    await writeAuthEvent(security, 'rate_limited', {
      requestId: request.id,
      ip: request.ip,
    });
    return reply
      .header('Retry-After', seconds)
      .code(429)
      .send({ message: 'Demasiados intentos. Intentá más tarde.' });
  };
}
