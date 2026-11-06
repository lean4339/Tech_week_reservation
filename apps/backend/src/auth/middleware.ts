import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthConfig } from './config.js';
import { readToken, setSessionCookie } from './cookies.js';
import { writeAuthEvent } from './audit.js';
import {
  ABSOLUTE_MS,
  IDLE_MS,
  publicUser,
  type Permission,
  type SecurityStore,
  type UserStore,
} from './model.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: ReturnType<typeof publicUser> | null;
  }
}

export function registerAuthentication(
  app: FastifyInstance,
  users: UserStore,
  security: SecurityStore,
  config: AuthConfig,
) {
  // Each request gets its own principal; never store identity on the app instance.
  app.decorateRequest('user', null);

  async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    request.user = null;
    const token = readToken(request, config);
    const session = token ? await security.readSession(token) : null;
    const now = Date.now();
    if (
      !session ||
      !Number.isFinite(session.createdAt) ||
      !Number.isFinite(session.lastSeenAt) ||
      now - session.createdAt >= ABSOLUTE_MS ||
      now - session.lastSeenAt >= IDLE_MS
    ) {
      setSessionCookie(reply, config);
      return reply.code(401).send({ message: 'Iniciá sesión para continuar.' });
    }
    const user = await users.findById(session.userId);
    if (!user?.active) {
      await security.deleteSession(token!);
      setSessionCookie(reply, config);
      return reply.code(401).send({ message: 'Iniciá sesión para continuar.' });
    }
    request.user = publicUser(user);
  }

  function requirePermission(permission: Permission) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user)
        return reply
          .code(401)
          .send({ message: 'Iniciá sesión para continuar.' });
      if (!request.user.permissions.includes(permission)) {
        await writeAuthEvent(
          security,
          'access_denied',
          {
            requestId: request.id,
            ip: request.ip,
          },
          request.user.id,
        );
        return reply
          .code(403)
          .send({ message: 'No tenés permiso para esta acción.' });
      }
    };
  }

  return { authenticate, requirePermission };
}

export type AuthMiddleware = ReturnType<typeof registerAuthentication>;
