import type { FastifyInstance, FastifyError } from 'fastify';
import type { AuthConfig } from '../auth/config.js';
import { PasswordBusyError, InvalidPasswordError } from '../auth/password.js';

export function registerHttpSecurity(app: FastifyInstance, config: AuthConfig) {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'",
    );
    if (config.secureCookies)
      reply.header('Strict-Transport-Security', 'max-age=31536000');
  });
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof InvalidPasswordError)
      return reply.code(400).send({
        message: 'Usá una contraseña poco común de entre 15 y 128 caracteres.',
      });
    if (error.validation || error.statusCode === 400)
      return reply.code(400).send({ message: 'Datos inválidos.' });
    if (error.statusCode === 413)
      return reply.code(413).send({ message: 'Solicitud demasiado grande.' });
    if (error instanceof PasswordBusyError)
      return reply
        .header('Retry-After', 5)
        .code(429)
        .send({ message: 'Servicio ocupado. Intentá más tarde.' });
    // Never serialize DB errors: they can include emails, hashes or connection strings.
    app.log.error({ requestId: request.id }, 'Request failed');
    return reply
      .code(503)
      .send({ message: 'Servicio no disponible. Intentá más tarde.' });
  });
}
