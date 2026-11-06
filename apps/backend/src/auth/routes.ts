import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthConfig } from './config.js';
import {
  ABSOLUTE_MS,
  IDLE_MS,
  permissions,
  publicUser,
  type AuditEvent,
  type Permission,
  type SecurityStore,
  type User,
  type UserStore,
} from './model.js';
import { hashPassword, validPassword, verifyPassword } from './password.js';

export const emailPattern =
  "^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$";
const credentialsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'password'],
  properties: {
    email: {
      type: 'string',
      minLength: 3,
      maxLength: 254,
      pattern: emailPattern,
    },
    password: { type: 'string', minLength: 1, maxLength: 128 },
  },
} as const;
type Credentials = { email: string; password: string };

export function readToken(request: FastifyRequest, config: AuthConfig) {
  const values = (request.headers.cookie ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.startsWith(`${config.cookieName}=`))
    .map((s) => s.slice(config.cookieName.length + 1));
  return values.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(values[0]!)
    ? values[0]
    : undefined;
}
function cookie(reply: FastifyReply, config: AuthConfig, token = '') {
  reply.header(
    'Set-Cookie',
    `${config.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? ABSOLUTE_MS / 1000 : 0}${config.secureCookies ? '; Secure' : ''}`,
  );
}

export async function authRoutes(
  app: FastifyInstance,
  users: UserStore,
  security: SecurityStore,
  config: AuthConfig,
) {
  const audit = (event: AuditEvent, request: FastifyRequest, userId?: string) =>
    security.audit({
      event,
      requestId: request.id,
      ...(userId ? { userId } : {}),
      time: new Date().toISOString(),
      ip: request.ip,
    });

  async function limited(
    request: FastifyRequest,
    reply: FastifyReply,
    key: string,
    limit: number,
    seconds: number,
  ) {
    if (await security.consume(key, limit, seconds)) return false;
    await audit('rate_limited', request);
    reply
      .header('Retry-After', seconds)
      .code(429)
      .send({ message: 'Demasiados intentos. Intentá más tarde.' });
    return true;
  }

  // No CORS. Exact Origin + a non-simple header also protect login against CSRF.
  app.addHook('onRequest', async (request, reply) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
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
      ) {
        return reply.code(415).send({ message: 'Se requiere JSON.' });
      }
    }
    if (await limited(request, reply, `requests:${request.ip}`, 120, 60))
      return;
  });

  async function authorize(
    request: FastifyRequest,
    reply: FastifyReply,
    permission: Permission,
  ): Promise<User | undefined> {
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
      cookie(reply, config);
      reply.code(401).send({ message: 'Iniciá sesión para continuar.' });
      return;
    }
    const user = await users.findById(session.userId);
    if (!user?.active) {
      await security.deleteSession(token!);
      cookie(reply, config);
      reply.code(401).send({ message: 'Iniciá sesión para continuar.' });
      return;
    }
    if (!permissions[user.role]?.includes(permission)) {
      await audit('access_denied', request, user.id);
      reply.code(403).send({ message: 'No tenés permiso para esta acción.' });
      return;
    }
    return user;
  }

  app.post<{ Body: Credentials }>(
    '/auth/signup',
    { schema: { body: credentialsSchema } },
    async (request, reply) => {
      if (await limited(request, reply, `signup:${request.ip}`, 10, 3600))
        return;
      const { password } = request.body;
      if (!validPassword(password))
        return reply.code(400).send({
          message:
            'Usá una contraseña poco común de entre 15 y 128 caracteres.',
        });
      const email = request.body.email.trim().toLowerCase();
      const user = await users.create(
        email,
        await hashPassword(password),
        'user',
      );
      await audit(
        user ? 'signup_created' : 'signup_duplicate',
        request,
        user?.id,
      );
      // Same response and hashing work for duplicates: do not reveal account existence.
      return reply.code(202).send({
        message:
          'Registro procesado. Podés intentar iniciar sesión con tus credenciales.',
      });
    },
  );

  app.post<{ Body: Credentials }>(
    '/auth/login',
    { schema: { body: credentialsSchema } },
    async (request, reply) => {
      const email = request.body.email.trim().toLowerCase();
      if (
        (await limited(request, reply, `login-ip:${request.ip}`, 30, 900)) ||
        (await limited(request, reply, `login-account:${email}`, 10, 900))
      )
        return;
      const user = await users.findByEmail(email);
      const verified = await verifyPassword(
        request.body.password,
        user?.password_hash,
      );
      if (!user?.active || !verified) {
        await audit('login_failed', request);
        return reply
          .code(401)
          .send({ message: 'Email o contraseña incorrectos.' });
      }
      const token = randomBytes(32).toString('base64url');
      const now = Date.now();
      await security.createSession(
        token,
        { userId: user.id, createdAt: now, lastSeenAt: now },
        readToken(request, config),
      );
      try {
        await audit('login_succeeded', request, user.id);
      } catch (error) {
        // Never issue a cookie for an unaudited session.
        await security.deleteSession(token);
        throw error;
      }
      cookie(reply, config, token);
      return { user: publicUser(user) };
    },
  );

  app.get('/auth/me', async (request, reply) => {
    const user = await authorize(request, reply, 'profile:read');
    if (user) return { user: publicUser(user) };
  });
  app.post(
    '/auth/logout',
    { schema: { body: { type: 'object', additionalProperties: false } } },
    async (request, reply) => {
      const token = readToken(request, config);
      if (token) await security.deleteSession(token);
      cookie(reply, config);
      await audit('logout', request);
      return reply.code(204).send();
    },
  );
  app.get('/admin/overview', async (request, reply) => {
    if (await authorize(request, reply, 'admin:read'))
      return { users: await users.count() };
  });
  app.get('/admin/auth-events', async (request, reply) => {
    if (await authorize(request, reply, 'audit:read'))
      return { events: await security.events() };
  });
  app.get('/admin/request-events', async (request, reply) => {
    if (await authorize(request, reply, 'audit:read'))
      return { requests: await security.requests() };
  });
}
