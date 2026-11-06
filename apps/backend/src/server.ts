import { buildApp } from './app.js';
import { migrate } from './db/migrate.js';

const app = buildApp();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().catch(() => {
      app.log.error('Could not close application resources.');
      process.exitCode = 1;
    });
  });
}

try {
  await app.ready();
  await migrate(app.pg.pool);
  await app.listen({
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 3001),
  });
} catch {
  app.log.error(
    'Startup failed. Check service availability, migrations and configuration.',
  );
  await app
    .close()
    .catch(() => app.log.error('Could not close application resources.'));
  process.exitCode = 1;
}
