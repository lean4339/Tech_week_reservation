import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../dist/auth/password.js';

test('session storage failure cannot record a successful login or issue a cookie', async (t) => {
  const { app, users, security } = setup(t);
  await users.create(
    'failure@example.test',
    await hashPassword(password),
    'user',
  );
  security.createSession = async () => {
    throw new Error('Session storage unavailable');
  };
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers,
    payload: { email: 'failure@example.test', password },
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.headers['set-cookie'], undefined);
  assert(!security.records.some((r) => r.event === 'login_succeeded'));
  assert.equal(security.sessions.size, 0);
});
import { setup, password, headers, cookieFrom, tokenFrom } from './helpers.ts';

test('signup cannot assign admin, permissions, ids or unknown properties', async (t) => {
  const { app, users } = setup(t);
  for (const extra of [
    { role: 'admin' },
    { permissions: ['admin:read'] },
    { id: randomUUID() },
  ]) {
    const result = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers,
      payload: { email: 'evil@example.com', password, ...extra },
    });
    assert.equal(result.statusCode, 400);
  }
  assert.equal(await users.count(), 0);
});

test('CSRF rejects missing, null, hostile and sibling origins, absent custom header and cross-site requests', async (t) => {
  const { app, users, security } = setup(t);
  for (const bad of [
    {},
    { ...headers, origin: 'null' },
    { ...headers, origin: 'https://evil.example' },
    { ...headers, origin: 'http://localhost:3000.evil.example' },
    { origin: headers.origin },
    { ...headers, 'sec-fetch-site': 'cross-site' },
  ]) {
    for (const url of ['/auth/signup', '/auth/login', '/auth/logout']) {
      const result = await app.inject({
        method: 'POST',
        url,
        headers: bad,
        payload: { email: 'a@example.com', password },
      });
      assert.equal(result.statusCode, 403);
    }
  }
  assert.equal(await users.count(), 0);
  assert.equal(security.sessions.size, 0);
});

test('invalid JSON, invalid shapes, long bodies and simple content types are rejected without side effects', async (t) => {
  const { app, users } = setup(t);
  for (const payload of [
    { email: 'not an email', password },
    { email: ['a@example.com'], password },
    { email: 'a@example.com', password: 123 },
  ]) {
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/signup',
          headers,
          payload,
        })
      ).statusCode,
      400,
    );
  }
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/auth/signup',
        headers: { ...headers, 'content-type': 'application/json' },
        payload: '{',
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/auth/signup',
        headers,
        payload: { email: 'a@example.com', password: 'a'.repeat(5000) },
      })
    ).statusCode,
    413,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { ...headers, 'content-type': 'text/plain' },
        payload: 'hello',
      })
    ).statusCode,
    415,
  );
  assert.equal(await users.count(), 0);
});

test('a successful login rotates an existing session', async (t) => {
  const { app, users, security } = setup(t);
  const user = await users.create(
    'alice@example.com',
    await hashPassword(password),
    'user',
  );
  assert(user);
  const old = 'a'.repeat(43);
  security.sessions.set(old, {
    userId: user.id,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { ...headers, cookie: `tech_week_session=${old}` },
    payload: { email: user.email, password },
  });
  assert.equal(response.statusCode, 200);
  assert.notEqual(tokenFrom(cookieFrom(response)), old);
  assert(!security.sessions.has(old));
});

test('missing, malformed, forged, duplicate and expired cookies cannot authenticate', async (t) => {
  const { app, users, security } = setup(t);
  const user = await users.create('alice@example.com', 'unused', 'user');
  assert(user);
  for (const cookie of [
    '',
    'tech_week_session=bad',
    `tech_week_session=${'a'.repeat(43)}`,
  ]) {
    assert.equal(
      (await app.inject({ url: '/auth/me', headers: { cookie } })).statusCode,
      401,
    );
  }
  for (const times of [
    { createdAt: Date.now() - 8 * 3600000, lastSeenAt: Date.now() },
    { createdAt: Date.now(), lastSeenAt: Date.now() - 30 * 60000 },
  ]) {
    security.sessions.set('a'.repeat(43), { userId: user.id, ...times });
    assert.equal(
      (
        await app.inject({
          url: '/auth/me',
          headers: { cookie: `tech_week_session=${'a'.repeat(43)}` },
        })
      ).statusCode,
      401,
    );
  }
  security.sessions.set('a'.repeat(43), {
    userId: user.id,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  assert.equal(
    (
      await app.inject({
        url: '/auth/me',
        headers: {
          cookie: `tech_week_session=${'a'.repeat(43)}; tech_week_session=${'b'.repeat(43)}`,
        },
      })
    ).statusCode,
    401,
  );
});

test('RBAC checks current database role and active status on every protected request', async (t) => {
  const { app, users, security } = setup(t);
  const user = await users.create('a@example.com', 'unused', 'user');
  assert(user);
  const token = 'a'.repeat(43);
  const cookie = `tech_week_session=${token}`;
  security.sessions.set(token, {
    userId: user.id,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  for (const url of ['/admin/overview', '/admin/auth-events']) {
    assert.equal((await app.inject({ url })).statusCode, 401);
    const response = await app.inject({
      url,
      headers: { cookie, 'x-role': 'admin' },
    });
    assert.equal(response.statusCode, 403);
    assert(!response.body.includes(user.email));
  }
  user.role = 'admin';
  assert.equal(
    (await app.inject({ url: '/admin/overview', headers: { cookie } }))
      .statusCode,
    200,
  );
  assert.equal(
    (await app.inject({ url: '/admin/auth-events', headers: { cookie } }))
      .statusCode,
    200,
  );
  user.role = 'user';
  assert.equal(
    (await app.inject({ url: '/admin/overview', headers: { cookie } }))
      .statusCode,
    403,
  );
  user.active = false;
  assert.equal(
    (await app.inject({ url: '/auth/me', headers: { cookie } })).statusCode,
    401,
  );
  assert(!security.sessions.has(token));
});

test('account and IP rate limits reject requests before issuing sessions', async (t) => {
  const { app, security } = setup(t);
  security.counts.set('login-account:alice@example.com', 10);
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers,
    payload: { email: 'Alice@example.com', password },
  });
  assert.equal(response.statusCode, 429);
  assert.equal(security.sessions.size, 0);
  assert(response.headers['retry-after']);
  security.counts.set('signup:127.0.0.1', 10);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/auth/signup',
        headers,
        payload: { email: 'new@example.com', password },
      })
    ).statusCode,
    429,
  );
});

test('Redis and database failures fail closed and do not expose internal errors', async (t) => {
  const { app, security, users } = setup(t);
  const secret = 'postgres://private-password@example.invalid';
  security.consume = async () => {
    throw new Error(secret);
  };
  const result = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers,
    payload: { email: 'a@example.com', password },
  });
  assert.equal(result.statusCode, 503);
  assert(!result.body.includes(secret));
  assert(!result.headers['set-cookie']);
  security.consume = async () => true;
  security.sessions.set('a'.repeat(43), {
    userId: randomUUID(),
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  users.findById = async () => {
    throw new Error(secret);
  };
  const me = await app.inject({
    url: '/auth/me',
    headers: { cookie: `tech_week_session=${'a'.repeat(43)}` },
  });
  assert.equal(me.statusCode, 503);
  assert(!me.body.includes(secret));
});
