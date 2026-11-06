import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthConfig } from './config.js';

export function csrfProtection(config: AuthConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    if (
      !config.origins.includes(request.headers.origin ?? '') ||
      request.headers['x-requested-with'] !== 'tech-week-web' ||
      request.headers['sec-fetch-site'] === 'cross-site'
    ) {
      return reply
        .code(403)
        .send({ message: 'Origen de solicitud no permitido.' });
    }
    if (
      request.headers['content-type']?.split(';')[0]?.trim() !==
      'application/json'
    )
      return reply.code(415).send({ message: 'Se requiere JSON.' });
  };
}
