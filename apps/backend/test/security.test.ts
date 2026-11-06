import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, password, headers } from './helpers.ts';
import { hashPassword, verifyPassword } from '../dist/auth/password.js';

test('a small concurrent hashing burst is bounded and capacity recovers afterward', async (t) => {
  const { app, users } = setup(t);
  const results = await Promise.all(
    [0, 1, 2].map((id) =>
      app.inject({
        method: 'POST',
        url: '/auth/signup',
        headers,
        payload: { email: `burst-${id}@example.test`, password },
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [202, 202, 429]);
  assert.equal(await users.count(), 2);
  const recovered = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    headers,
    payload: { email: 'after-burst@example.test', password },
  });
  assert.equal(recovered.statusCode, 202);
  assert.equal(await users.count(), 3);
});

test('HTML, SQL-like malformed email, CRLF and object injection payloads cannot create users', async (t) => {
  const { app, users } = setup(t);
  for (const email of [
    '<svg/onload=alert(1)>@example.test',
    "a' OR 1=1 --@example.test",
    'x@example.test<script>',
    'a\r\nBcc: x@example.test',
  ]) {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers,
      payload: { email, password },
    });
    assert.equal(response.statusCode, 400);
    assert(!response.body.includes(email));
  }
  const object = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers,
    payload: { email: { $ne: null }, password },
  });
  assert.equal(object.statusCode, 400);
  assert.equal(await users.count(), 0);
});

test('prototype-pollution fields are rejected and do not alter the process prototype', async (t) => {
  const { app, users } = setup(t);
  const payload =
    JSON.stringify({ email: 'pollution@example.test', password }).slice(0, -1) +
    ',"__proto__":{"__auth_polluted__":true}}';
  const response = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    headers: { ...headers, 'content-type': 'application/json' },
    payload,
  });
  assert.equal(response.statusCode, 400);
  assert.equal(
    Object.prototype.hasOwnProperty.call(Object.prototype, '__auth_polluted__'),
    false,
  );
  assert.equal(await users.count(), 0);
});

test('request auditing records the socket IP and ignores forged forwarding headers', async (t) => {
  const { app, security } = setup(t);
  const result = await app.inject({
    url: '/auth/me?password=never-log-this',
    headers: {
      'x-forwarded-for': '203.0.113.99',
      'x-real-ip': '203.0.113.98',
      'x-request-id': 'attacker-request-id',
    },
  });
  assert.equal(result.statusCode, 401);
  const record = security.requestRecords.at(-1)!;
  assert.equal(record.ip, '127.0.0.1');
  assert.equal(record.ipSource, 'socket');
  assert.equal(record.status, 401);
  assert.equal(record.method, 'GET');
  assert.equal(record.route, '/auth/me');
  assert(record.durationMs >= 0);
  assert.notEqual(record.requestId, 'attacker-request-id');
  assert(!JSON.stringify(record).includes('never-log-this'));
});

test('invalid requests and CSRF rejections are audited without body or arbitrary URL contents', async (t) => {
  const { app, security } = setup(t);
  await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { origin: 'https://attacker.invalid' },
    payload: { email: 'secret@example.test', password },
  });
  assert.equal(security.requestRecords.at(-1)!.status, 403);
  await app.inject({ url: '/password-secret-in-path?token=secret-token' });
  assert.equal(security.requestRecords.at(-1)!.status, 404);
  assert.equal(security.requestRecords.at(-1)!.route, '/unmatched');
  const log = JSON.stringify(security.requestRecords);
  for (const secret of [
    password,
    'secret@example.test',
    'secret-token',
    'password-secret-in-path',
  ])
    assert(!log.includes(secret));
});

test('a user cannot read another identity or request audit records by changing headers or query ids', async (t) => {
  const { app, users, security } = setup(t);
  const alice = await users.create('alice@example.test', 'unused', 'user');
  const bob = await users.create('bob@example.test', 'unused', 'admin');
  assert(alice && bob);
  const token = 'a'.repeat(43);
  security.sessions.set(token, {
    userId: alice.id,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  const spoofed = {
    cookie: `tech_week_session=${token}`,
    'x-user-id': bob.id,
    'x-role': 'admin',
  };
  const response = await app.inject({
    url: `/auth/me?userId=${bob.id}`,
    headers: spoofed,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.id, alice.id);
  assert(!response.body.includes(bob.email));
  assert.equal(
    (await app.inject({ url: '/admin/request-events', headers: spoofed }))
      .statusCode,
    403,
  );
  alice.role = 'admin';
  assert.equal(
    (await app.inject({ url: '/admin/request-events', headers: spoofed }))
      .statusCode,
    200,
  );
});

test('spoofing a forwarded IP cannot bypass the login IP limit', async (t) => {
  const { app, security } = setup(t);
  security.counts.set('login-ip:127.0.0.1', 30);
  for (const forged of ['203.0.113.1', '203.0.113.2']) {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { ...headers, 'x-forwarded-for': forged },
      payload: { email: 'any@example.test', password },
    });
    assert.equal(response.statusCode, 429);
  }
  assert.equal(security.sessions.size, 0);
});

test('authentication responses are not cacheable and do not enable cross-origin credential access', async (t) => {
  const { app } = setup(t);
  const response = await app.inject({
    url: '/auth/me',
    headers: { origin: 'https://attacker.invalid' },
  });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.equal(response.headers['access-control-allow-origin'], undefined);
  assert.equal(response.headers['access-control-allow-credentials'], undefined);
});

test('cryptography retains the configured scrypt cost, rejects tampering and never truncates passwords', async () => {
  const maximum = 'x'.repeat(127) + 'A';
  const hash = await hashPassword(maximum);
  assert.match(hash, /^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  assert(await verifyPassword(maximum, hash));
  assert(!(await verifyPassword('x'.repeat(127) + 'B', hash)));
  const tampered = hash.slice(0, -1) + (hash.endsWith('0') ? '1' : '0');
  assert(!(await verifyPassword(maximum, tampered)));
  await assert.rejects(
    verifyPassword(maximum, hash.replace('$131072$', '$1024$')),
  );
});

test('request log storage failure does not bypass authorization or change a rejection to success', async (t) => {
  const { app, security } = setup(t);
  security.logRequest = async () => {
    throw new Error('Redis request log failed');
  };
  const response = await app.inject({ url: '/admin/request-events' });
  assert.equal(response.statusCode, 401);
  assert(!response.body.includes('Redis request log failed'));
});
