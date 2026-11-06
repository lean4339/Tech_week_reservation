import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../dist/auth/password.js';
import { buildApp } from '../dist/app.js';
import Fastify from 'fastify';
import { EventEmitter } from 'node:events';
import type { Redis } from 'ioredis';
import { connectRedis } from '../dist/db/redis.js';
import { readAdminPassword } from '../dist/db/admin-password.js';

test('admin password prompt explains rules, retries invalid input and confirmation without exposing secrets', async () => {
  const accepted = 'Una frase privada para pruebas';
  const answers = [
    'short',
    'passwordpassword',
    accepted,
    'Otra confirmación distinta',
    accepted,
    accepted,
  ];
  const labels: string[] = [];
  const messages: string[] = [];
  const result = await readAdminPassword({
    readHidden: async (label) => {
      assert(messages[0]?.includes('entre 15 y 128'));
      labels.push(label);
      assert(answers.length);
      return answers.shift()!;
    },
    write: (message) => {
      messages.push(message);
    },
  });
  assert.equal(result, accepted);
  assert.equal(answers.length, 0);
  assert.equal(
    labels.filter((label) => label.startsWith('Confirmá')).length,
    2,
  );
  const output = messages.join('');
  assert.match(output, /al menos 15/);
  assert.match(output, /comunes bloqueadas/);
  assert.match(output, /no coinciden/);
  for (const secret of [
    'short',
    'passwordpassword',
    accepted,
    'Otra confirmación distinta',
  ])
    assert(!output.includes(secret));
});

test('Redis startup failure releases the client without issuing QUIT on a disconnected socket', async () => {
  let disconnected = false;
  let quitCalled = false;
  class UnavailableRedis extends EventEmitter {
    async connect() {
      throw new Error('Redis unavailable');
    }
    disconnect() {
      disconnected = true;
    }
    async quit() {
      quitCalled = true;
      throw new Error('Socket unavailable');
    }
  }
  const app = Fastify({ logger: false });
  app.register(async (scope) =>
    connectRedis(scope, new UnavailableRedis() as unknown as Redis),
  );
  await assert.rejects(app.ready(), /Redis unavailable/);
  await app.close();
  assert.equal(disconnected, true);
  assert.equal(quitCalled, false);
});

test('audit storage failure cannot issue a successful login cookie', async (t) => {
  const { app, users, security } = setup(t);
  await users.create(
    'audit@example.test',
    await hashPassword(password),
    'user',
  );
  security.audit = async () => {
    throw new Error('audit backend unavailable');
  };
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers,
    payload: { email: 'audit@example.test', password },
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.headers['set-cookie'], undefined);
  assert.equal(security.sessions.size, 0);
  assert(!response.body.includes('audit backend unavailable'));
});

test('production login serializes a Secure host-only cookie with an absolute lifetime', async (t) => {
  const { users, security } = setup(t);
  await users.create(
    'secure@example.test',
    await hashPassword(password),
    'admin',
  );
  const node = process.env.NODE_ENV;
  const origins = process.env.APP_ORIGINS;
  let app;
  try {
    process.env.NODE_ENV = 'production';
    process.env.APP_ORIGINS = 'https://example.test';
    app = buildApp({ stores: { users, security }, logger: false });
  } finally {
    if (node === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = node;
    if (origins === undefined) delete process.env.APP_ORIGINS;
    else process.env.APP_ORIGINS = origins;
  }
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { ...headers, origin: 'https://example.test' },
    payload: { email: 'secure@example.test', password },
  });
  assert.equal(response.statusCode, 200);
  const cookie = String(response.headers['set-cookie']);
  assert.match(cookie, /^__Host-tech_week_session=/);
  assert.match(cookie, /; Secure$/);
  assert.match(cookie, /HttpOnly; SameSite=Lax; Max-Age=28800/);
  assert(!cookie.includes('Domain='));
  assert.equal(
    response.headers['strict-transport-security'],
    'max-age=31536000',
  );
});
import { setup, password, headers, cookieFrom, tokenFrom } from './helpers.ts';

test('signup persists a normalized user; duplicates do not reveal existence or change credentials', async (t) => {
  const { app, users } = setup(t);
  const request = {
    method: 'POST' as const,
    url: '/auth/signup',
    headers,
    payload: {
      email: 'ALICE@example.com',
      password,
      businessName: "  Café O'Connor & Hijos  ",
    },
  };
  const response = await app.inject(request);
  assert.equal(response.statusCode, 202);
  const user = await users.findByEmail('alice@example.com');
  assert(user);
  assert.equal(user.role, 'user');
  assert.equal(user.business_name, "Café O'Connor & Hijos");
  assert(await verifyPassword(password, user.password_hash));
  const repeated = await app.inject({
    ...request,
    payload: {
      email: 'alice@example.com',
      businessName: 'Intento de reemplazo',
      password: 'A different sufficiently long password',
    },
  });
  assert.equal(repeated.statusCode, response.statusCode);
  assert.deepEqual(repeated.json(), response.json());
  assert.equal(await users.count(), 1);
  assert.equal(user.business_name, "Café O'Connor & Hijos");
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers,
    payload: { email: user.email, password },
  });
  assert.equal(login.statusCode, 200);
  assert.equal(login.json().user.businessName, user.business_name);
  const me = await app.inject({
    url: '/auth/me',
    headers: { cookie: cookieFrom(login) },
  });
  assert.equal(me.json().user.businessName, user.business_name);
  assert(await verifyPassword(password, user.password_hash));
});

test('login sets an HttpOnly session; logout revokes it; logs and responses exclude credentials', async (t) => {
  const { app, users, security } = setup(t);
  const user = await users.create(
    'alice@example.com',
    await hashPassword(password),
    'user',
  );
  assert(user);
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers,
    payload: { email: user.email, password },
  });
  assert.equal(login.statusCode, 200);
  const cookie = cookieFrom(login);
  assert.match(String(login.headers['set-cookie']), /HttpOnly; SameSite=Lax/);
  assert.equal(login.headers['cache-control'], 'no-store');
  assert(!login.body.includes('password_hash'));
  const me = await app.inject({ url: '/auth/me', headers: { cookie } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.id, user.id);
  assert.deepEqual(me.json().user.permissions, [
    'profile:read',
    'rooms:read',
    'reservations:own',
    'buildings:read',
  ]);
  const logout = await app.inject({
    method: 'POST',
    url: '/auth/logout',
    headers: { ...headers, cookie },
    payload: {},
  });
  assert.equal(logout.statusCode, 204);
  assert.match(String(logout.headers['set-cookie']), /Max-Age=0/);
  assert.equal(
    (await app.inject({ url: '/auth/me', headers: { cookie } })).statusCode,
    401,
  );
  const logs = JSON.stringify(security.records);
  for (const secret of [
    password,
    user.password_hash,
    tokenFrom(cookie),
    user.email,
  ])
    assert(!logs.includes(secret));
  assert(security.records.some((r) => r.event === 'login_succeeded'));
  assert(security.records.some((r) => r.event === 'logout'));
});

test('wrong password, unknown account and inactive account return the same error and no session', async (t) => {
  const { app, users, security } = setup(t);
  const user = await users.create(
    'alice@example.com',
    await hashPassword(password),
    'user',
  );
  assert(user);
  const responses = [];
  for (const payload of [
    { email: user.email, password: 'wrong password' },
    { email: 'unknown@example.com', password },
  ]) {
    responses.push(
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers,
        payload,
      }),
    );
  }
  user.active = false;
  responses.push(
    await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers,
      payload: { email: user.email, password },
    }),
  );
  for (const r of responses) {
    assert.equal(r.statusCode, 401);
    assert.deepEqual(r.json(), responses[0]!.json());
    assert(!r.headers['set-cookie']);
  }
  assert.equal(security.sessions.size, 0);
});
