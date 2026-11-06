import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthConfig } from './config.js';
import { ABSOLUTE_MS } from './model.js';

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
export function setSessionCookie(
  reply: FastifyReply,
  config: AuthConfig,
  token = '',
) {
  reply.header(
    'Set-Cookie',
    `${config.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? ABSOLUTE_MS / 1000 : 0}${config.secureCookies ? '; Secure' : ''}`,
  );
}
