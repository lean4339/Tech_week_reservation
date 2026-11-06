import { randomBytes } from 'node:crypto';
import type { SecurityStore, UserStore } from './model.js';
import { publicUser } from './model.js';
import {
  hashPassword,
  verifyPassword,
  validPassword,
  InvalidPasswordError,
} from './password.js';
import { writeAuthEvent, type AuditContext } from './audit.js';
import type { Credentials } from './schemas.js';

export function createAuthService(users: UserStore, security: SecurityStore) {
  return {
    async signup(credentials: Credentials, context: AuditContext) {
      if (!validPassword(credentials.password))
        throw new InvalidPasswordError();
      const user = await users.create(
        credentials.email.trim().toLowerCase(),
        await hashPassword(credentials.password),
        'user',
      );
      await writeAuthEvent(
        security,
        user ? 'signup_created' : 'signup_duplicate',
        context,
        user?.id,
      );
    },

    async login(
      credentials: Credentials,
      context: AuditContext,
      previous?: string,
    ) {
      const user = await users.findByEmail(
        credentials.email.trim().toLowerCase(),
      );
      const verified = await verifyPassword(
        credentials.password,
        user?.password_hash,
      );
      if (!user?.active || !verified) {
        await writeAuthEvent(security, 'login_failed', context);
        return null;
      }
      const token = randomBytes(32).toString('base64url');
      const now = Date.now();
      await security.createSession(
        token,
        { userId: user.id, createdAt: now, lastSeenAt: now },
        previous,
      );
      try {
        await writeAuthEvent(security, 'login_succeeded', context, user.id);
      } catch (error) {
        await security.deleteSession(token);
        throw error;
      }
      return { token, user: publicUser(user) };
    },

    async logout(token: string | undefined, context: AuditContext) {
      if (token) await security.deleteSession(token);
      await writeAuthEvent(security, 'logout', context);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
