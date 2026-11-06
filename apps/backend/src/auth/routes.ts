import type { FastifyInstance } from 'fastify';
import type { AuthConfig } from './config.js';
import type { SecurityStore, UserStore } from './model.js';
import type { AuthMiddleware } from './middleware.js';
import { authControllers } from './controllers.js';
import { createAuthService } from './service.js';
import {
  credentialsSchema,
  signupSchema,
  logoutSchema,
  type Credentials,
  type SignupInput,
} from './schemas.js';
import { rateLimit } from './rate-limit.js';

export function publicAuthRoutes(
  app: FastifyInstance,
  users: UserStore,
  security: SecurityStore,
  config: AuthConfig,
) {
  const handlers = authControllers(createAuthService(users, security), config);
  app.post<{ Body: SignupInput }>(
    '/auth/signup',
    {
      schema: { body: signupSchema },
      preHandler: rateLimit(
        security,
        (request) => `signup:${request.ip}`,
        10,
        3600,
      ),
    },
    handlers.signup,
  );
  app.post<{ Body: Credentials }>(
    '/auth/login',
    {
      schema: { body: credentialsSchema },
      // preHandler runs after schema validation, so email is a validated string.
      preHandler: [
        rateLimit(security, (request) => `login-ip:${request.ip}`, 30, 900),
        rateLimit(
          security,
          (request) =>
            `login-account:${(request.body as Credentials).email.trim().toLowerCase()}`,
          10,
          900,
        ),
      ],
    },
    handlers.login,
  );
  // Idempotent logout also clears an expired or missing session.
  app.post('/auth/logout', { schema: { body: logoutSchema } }, handlers.logout);
}

export function profileRoutes(app: FastifyInstance, auth: AuthMiddleware) {
  app.get(
    '/auth/me',
    {
      preHandler: auth.requirePermission('profile:read'),
    },
    async (request) => ({ user: request.user }),
  );
}
