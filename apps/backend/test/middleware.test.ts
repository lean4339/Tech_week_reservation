import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAuthentication } from '../dist/auth/middleware.js';
import { authConfig } from '../dist/auth/config.js';
import { MemoryUsers, MemorySecurity, setup } from './helpers.ts';

function fixture(t: TestContext) {
  const app = Fastify({ logger: false });
  const users = new MemoryUsers();
  const security = new MemorySecurity();
  const auth = registerAuthentication(app, users, security, authConfig());
  t.after(() => app.close());
  return { app, users, security, auth };
}

test('authentication middleware stops requests before validation and business handlers, including nested routes', async (t) => {
  const { app, auth } = fixture(t);
  let calls = 0;
  app.get('/public', async (request) => ({ user: request.user }));
  app.register(async (privateRoutes) => {
    privateRoutes.addHook('onRequest', auth.authenticate);
    privateRoutes.register(async (nested) => {
      nested.get(
        '/private',
        {
          schema: {
            querystring: {
              type: 'object',
              required: ['value'],
              properties: { value: { type: 'string' } },
            },
          },
        },
        async () => {
          calls++;
          return { secret: 'private result' };
        },
      );
    });
  });
  for (const cookie of [
    '',
    'tech_week_session=invalid',
    `tech_week_session=${'x'.repeat(43)}`,
  ]) {
    const result = await app.inject({ url: '/private', headers: { cookie } });
    assert.equal(result.statusCode, 401); // Authentication precedes the query validation error.
    assert(!result.body.includes('private result'));
  }
  assert.equal(calls, 0);
  const publicResponse = await app.inject('/public');
  assert.equal(publicResponse.statusCode, 200);
  assert.deepEqual(publicResponse.json(), { user: null });
});

test('permission middleware blocks side effects, uses current roles, and revokes inactive identities', async (t) => {
  const { app, auth, users, security } = fixture(t);
  const user = (await users.create(
    'member@example.test',
    'never-expose-hash',
    'user',
  ))!;
  const token = 'a'.repeat(43);
  const headers = { cookie: `tech_week_session=${token}`, 'x-role': 'admin' };
  security.sessions.set(token, {
    userId: user.id,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  let calls = 0;
  app.register(async (privateRoutes) => {
    privateRoutes.addHook('onRequest', auth.authenticate);
    privateRoutes.get(
      '/private',
      { preHandler: auth.requirePermission('audit:read') },
      async (request) => {
        calls++;
        return { user: request.user };
      },
    );
  });
  assert.equal(
    (await app.inject({ url: '/private', headers })).statusCode,
    403,
  );
  assert.equal(calls, 0);
  assert.equal(security.records.at(-1)?.event, 'access_denied');
  user.role = 'admin';
  const allowed = await app.inject({ url: '/private', headers });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.json().user.id, user.id);
  assert(!allowed.body.includes('password_hash'));
  assert(!allowed.body.includes('never-expose-hash'));
  assert.equal(calls, 1);
  user.role = 'user';
  assert.equal(
    (await app.inject({ url: '/private', headers })).statusCode,
    403,
  );
  user.active = false;
  assert.equal(
    (await app.inject({ url: '/private', headers })).statusCode,
    401,
  );
  assert.equal(calls, 1);
  assert(!security.sessions.has(token));
});

test('concurrent requests keep principals isolated and public routes do not inherit an identity', async (t) => {
  const { app, auth, users, security } = fixture(t);
  const alice = (await users.create('alice@example.test', 'unused', 'user'))!;
  const bob = (await users.create('bob@example.test', 'unused', 'admin'))!;
  const actors = [
    { token: 'a'.repeat(43), user: alice },
    { token: 'b'.repeat(43), user: bob },
  ];
  for (const { token, user } of actors)
    security.sessions.set(token, {
      userId: user.id,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });
  app.get('/public', async (request) => ({ user: request.user }));
  app.register(async (privateRoutes) => {
    privateRoutes.addHook('onRequest', auth.authenticate);
    privateRoutes.get(
      '/me',
      { preHandler: auth.requirePermission('profile:read') },
      async (request) => {
        await new Promise<void>((resolve) => setImmediate(resolve));
        return { user: request.user };
      },
    );
  });
  await Promise.all(
    Array.from({ length: 12 }, async (_, i) => {
      const actor = actors[i % actors.length]!;
      const response = await app.inject({
        url: '/me',
        headers: { cookie: `tech_week_session=${actor.token}` },
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().user.id, actor.user.id);
      assert.equal(response.json().user.role, actor.user.role);
    }),
  );
  assert.equal((await app.inject('/me')).statusCode, 401);
  assert.deepEqual((await app.inject('/public')).json(), { user: null });
});

test('permission middleware denies access if authentication was not installed on the route', async (t) => {
  const { app, auth } = fixture(t);
  let calls = 0;
  app.get(
    '/misconfigured',
    { preHandler: auth.requirePermission('admin:read') },
    async () => {
      calls++;
      return {};
    },
  );
  const result = await app.inject({
    url: '/misconfigured',
    headers: {
      cookie: `tech_week_session=${'a'.repeat(43)}`,
      'x-role': 'admin',
    },
  });
  assert.equal(result.statusCode, 401);
  assert.equal(calls, 0);
});

test('all registered admin endpoints block anonymous and user requests before accessing admin data', async (t) => {
  const { app, users, security } = setup(t);
  const user = (await users.create('member@example.test', 'unused', 'user'))!;
  const token = 'a'.repeat(43);
  security.sessions.set(token, {
    userId: user.id,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  let calls = 0;
  users.count = async () => {
    calls++;
    return 10;
  };
  security.events = async () => {
    calls++;
    return [];
  };
  security.requests = async () => {
    calls++;
    return [];
  };
  for (const url of [
    '/admin/overview',
    '/admin/auth-events',
    '/admin/request-events',
  ]) {
    assert.equal((await app.inject({ url })).statusCode, 401);
    assert.equal(
      (
        await app.inject({
          url,
          headers: { cookie: `tech_week_session=${token}` },
        })
      ).statusCode,
      403,
    );
  }
  assert.equal(calls, 0);
});
