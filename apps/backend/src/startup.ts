import type { FastifyInstance, FastifyListenOptions } from 'fastify';
import { migrate } from './db/migrate.js';

const hints: Record<string, string> = {
  ECONNREFUSED:
    'Start PostgreSQL and Redis with npm run db:up; check their configured ports.',
  ENOTFOUND: 'Check the database and Redis host names.',
  EAI_AGAIN:
    'Database or Redis host name resolution failed; check local networking.',
  EADDRINUSE: 'The backend port is already in use.',
  EACCES: 'The operating system denied access to a required resource.',
  EPERM: 'The execution environment denied a required operation.',
  '28P01':
    'PostgreSQL rejected the credentials; check the backend environment and existing database volume.',
  '3D000': 'The configured PostgreSQL database does not exist.',
  '42501': 'The PostgreSQL user lacks the required database permissions.',
};

export function startupFailure(error: unknown, stage: string) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  const knownCode =
    typeof code === 'string' && Object.hasOwn(hints, code) ? code : 'UNKNOWN';
  return {
    event: 'startup_failed',
    stage,
    code: knownCode,
    hint:
      hints[knownCode] ??
      'Check service availability, migrations and application configuration.',
  };
}

export async function startServer(
  app: FastifyInstance,
  listen: FastifyListenOptions,
) {
  let stage = 'plugins';
  try {
    await app.ready();
    stage = 'migrations';
    await migrate(app.pg.pool);
    stage = 'listen';
    await app.listen(listen);
    return true;
  } catch (error) {
    // Driver messages can contain credentials or SQL. Log only known codes and fixed hints.
    app.log.error(startupFailure(error, stage), 'Backend startup failed');
    await app
      .close()
      .catch(() => app.log.error('Could not close application resources.'));
    return false;
  }
}
