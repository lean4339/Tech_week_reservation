import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthConfig } from './config.js';
import type { AuthService } from './service.js';
import type { Credentials } from './schemas.js';
import { readToken, setSessionCookie } from './cookies.js';

const auditContext = (request: FastifyRequest) => ({
  requestId: request.id,
  ip: request.ip,
});

export function authControllers(service: AuthService, config: AuthConfig) {
  return {
    async signup(
      request: FastifyRequest<{ Body: Credentials }>,
      reply: FastifyReply,
    ) {
      await service.signup(request.body, auditContext(request));
      return reply.code(202).send({
        message:
          'Registro procesado. Podés intentar iniciar sesión con tus credenciales.',
      });
    },
    async login(
      request: FastifyRequest<{ Body: Credentials }>,
      reply: FastifyReply,
    ) {
      const result = await service.login(
        request.body,
        auditContext(request),
        readToken(request, config),
      );
      if (!result)
        return reply
          .code(401)
          .send({ message: 'Email o contraseña incorrectos.' });
      setSessionCookie(reply, config, result.token);
      return { user: result.user };
    },
    async logout(request: FastifyRequest, reply: FastifyReply) {
      await service.logout(readToken(request, config), auditContext(request));
      setSessionCookie(reply, config);
      return reply.code(204).send();
    },
  };
}
