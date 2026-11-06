import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import Fastify from 'fastify';
import { Redis } from 'ioredis';
import { buildApp } from '../dist/app.js';
import { connectRedis } from '../dist/db/redis.js';
import { startServer, startupFailure } from '../dist/startup.js';

test('real application plugins initialize and expose routes when the Redis transport connects', async (t) => {
  let disconnected = false;
  t.mock.method(Redis.prototype, 'connect', async function (this: Redis) {
    this.status = 'ready';
  });
  t.mock.method(Redis.prototype, 'disconnect', function (this: Redis) {
    this.status = 'end';
    disconnected = true;
  });
  // Only the Redis transport is replaced. Fastify and both storage plugins are real.
  const app = buildApp({ logger: false });
  try {
    await app.ready();
    assert(app.pg.pool);
    for (const url of [
      '/health',
      '/auth/me',
      '/admin/overview',
      '/admin/auth-events',
      '/admin/request-events',
    ])
      assert(app.hasRoute({ method: 'GET', url }));
    for (const url of ['/auth/login', '/auth/signup', '/auth/logout'])
      assert(app.hasRoute({ method: 'POST', url }));
  } finally {
    await app.close();
  }
  assert(disconnected);
});

test('Redis startup preserves the original connection error and closes the client', async () => {
  const original = Object.assign(
    new Error('Connection refused at private Redis URL'),
    { code: 'ECONNREFUSED' },
  );
  let disconnected = false;
  class FailedRedis extends EventEmitter {
    async connect() {
      this.emit('error', original);
      throw new Error('Connection is closed.');
    }
    disconnect() {
      disconnected = true;
    }
  }
  const app = Fastify({ logger: false });
  app.register(async (scope) =>
    connectRedis(scope, new FailedRedis() as unknown as Redis),
  );
  try {
    await assert.rejects(app.ready(), (error) => error === original);
  } finally {
    await app.close();
  }
  assert(disconnected);
});

test('startup failures expose only allowlisted codes, fixed hints and the failing stage', () => {
  const secret = 'postgresql://user:private-password@private-host/database';
  for (const code of ['ECONNREFUSED', '28P01', 'EPERM', 'EADDRINUSE']) {
    const result = startupFailure(
      Object.assign(new Error(secret), { code }),
      'migrations',
    );
    assert.equal(result.code, code);
    assert.equal(result.stage, 'migrations');
    assert(!JSON.stringify(result).includes(secret));
  }
  assert.equal(
    startupFailure({ code: secret, message: secret }, 'plugins').code,
    'UNKNOWN',
  );
  assert.equal(startupFailure(null, 'plugins').code, 'UNKNOWN');
});

test('startup failure during plugin loading closes resources and never listens', async (t) => {
  const app = Fastify({ logger: false });
  let closed = false;
  let listens = 0;
  app.addHook('onClose', async () => {
    closed = true;
  });
  app.register(async () => {
    throw Object.assign(new Error('private connection details'), {
      code: 'ECONNREFUSED',
    });
  });
  t.mock.method(app, 'listen', async () => {
    listens++;
    return 'unused';
  });
  assert.equal(await startServer(app, { host: '127.0.0.1', port: 0 }), false);
  assert.equal(listens, 0);
  assert(closed);
});
