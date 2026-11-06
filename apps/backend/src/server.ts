import { buildApp } from './app.js';
import { startServer } from './startup.js';

const app = buildApp();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().catch(() => {
      app.log.error('Could not close application resources.');
      process.exitCode = 1;
    });
  });
}

if (
  !(await startServer(app, {
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 3001),
  }))
) {
  process.exitCode = 1;
}
