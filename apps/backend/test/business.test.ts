import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../dist/app.js';
import { validatePeriod } from '../dist/business/service.js';
import { BusinessError, type BusinessStore } from '../dist/business/model.js';
import { MemoryUsers, MemorySecurity, headers } from './helpers.ts';
import { ABSOLUTE_MS } from '../dist/auth/model.js';

const id = randomUUID();
const period = {
  startsAt: '2035-01-01T12:00:00Z',
  endsAt: '2035-01-01T13:00:00Z',
};
const query = `from=${period.startsAt}&to=${period.endsAt}`;
const routes = [
  { method: 'GET', url: '/buildings' },
  { method: 'GET', url: `/buildings/${id}` },
  { method: 'HEAD', url: '/buildings' },
  { method: 'HEAD', url: `/buildings/${id}` },
  {
    method: 'POST',
    url: '/buildings',
    payload: { name: 'Edificio', address: 'Calle 123' },
  },
  {
    method: 'PATCH',
    url: `/buildings/${id}`,
    payload: { name: 'Edificio nuevo' },
  },
  { method: 'DELETE', url: `/buildings/${id}`, payload: {} },
  { method: 'GET', url: '/admin/clients' },
  { method: 'HEAD', url: '/admin/clients' },
  { method: 'GET', url: '/rooms' },
  { method: 'GET', url: `/rooms/${id}` },
  { method: 'HEAD', url: `/rooms/${id}` },
  { method: 'GET', url: `/rooms/${id}/availability?${query}` },
  {
    method: 'POST',
    url: '/rooms',
    payload: { name: 'Sala prueba', capacity: 8 },
  },
  { method: 'PATCH', url: `/rooms/${id}`, payload: { capacity: 9 } },
  { method: 'DELETE', url: `/rooms/${id}`, payload: {} },
  ...['/reservations', '/admin/reservations'].flatMap((path) => [
    { method: 'GET', url: `${path}?${query}` },
    { method: 'GET', url: `${path}/${id}` },
    { method: 'HEAD', url: `${path}/${id}` },
    {
      method: 'POST',
      url: path,
      payload: {
        roomId: id,
        ...period,
        ...(path.startsWith('/admin') ? { userId: id } : {}),
      },
    },
    { method: 'PATCH', url: `${path}/${id}`, payload: period },
    { method: 'DELETE', url: `${path}/${id}`, payload: {} },
  ]),
] as const;
async function fixture(t: TestContext) {
  const users = new MemoryUsers();
  const security = new MemorySecurity();
  let calls = 0;
  const business = Object.fromEntries(
    [
      'clients',
      'buildings',
      'building',
      'createBuilding',
      'updateBuilding',
      'rooms',
      'room',
      'createRoom',
      'updateRoom',
      'availability',
      'reservations',
      'reservation',
      'createReservation',
      'updateReservation',
      'cancelReservation',
    ].map((method) => [
      method,
      async () => {
        calls++;
        return {};
      },
    ]),
  ) as unknown as BusinessStore;
  const app = buildApp({
    stores: { users, security, business },
    logger: false,
  });
  t.after(() => app.close());
  const user = (await users.create('client@example.test', 'unused', 'user'))!;
  const token = 'b'.repeat(43);
  security.sessions.set(token, {
    userId: user.id,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  return {
    app,
    security,
    user,
    business,
    calls: () => calls,
    cookie: `tech_week_session=${token}`,
    token,
  };
}

test('every business endpoint rejects missing, invalid and expired sessions before any repository effect', async (t) => {
  const f = await fixture(t);
  f.security.sessions.get(f.token)!.createdAt -= ABSOLUTE_MS;
  for (const route of routes) {
    for (const cookie of ['', 'tech_week_session=invalid', f.cookie]) {
      const response = await f.app.inject({
        ...route,
        headers: { ...headers, cookie },
      });
      assert.equal(
        response.statusCode,
        401,
        `${route.method} ${route.url}: ${response.body}`,
      );
    }
  }
  assert.equal(f.calls(), 0);
});

test('clients cannot write rooms or access any admin reservation method, including with forged identity headers', async (t) => {
  const f = await fixture(t);
  for (const route of routes.filter(
    (r) =>
      r.url.startsWith('/admin') ||
      ((r.url.startsWith('/rooms') || r.url.startsWith('/buildings')) &&
        !['GET', 'HEAD'].includes(r.method)),
  )) {
    const response = await f.app.inject({
      ...route,
      headers: {
        ...headers,
        cookie: f.cookie,
        'x-role': 'admin',
        'x-user-id': randomUUID(),
      },
    });
    assert.equal(response.statusCode, 403, `${route.method} ${route.url}`);
  }
  assert.equal(f.calls(), 0);
  f.user.role = 'admin';
  assert.equal(
    (
      await f.app.inject({
        method: 'POST',
        url: '/rooms',
        headers: { ...headers, cookie: f.cookie },
        payload: { name: 'Sala válida', capacity: 8, buildingId: id },
      })
    ).statusCode,
    201,
  );
  f.user.role = 'user';
  assert.equal(
    (
      await f.app.inject({
        method: 'POST',
        url: '/rooms',
        headers: { ...headers, cookie: f.cookie },
        payload: { name: 'Otra sala', capacity: 8 },
      })
    ).statusCode,
    403,
  );
  f.user.active = false;
  assert.equal(
    (await f.app.inject({ url: '/rooms', headers: { cookie: f.cookie } }))
      .statusCode,
    401,
  );
  assert.equal(f.calls(), 1);
});

test('business writes enforce CSRF before effects and never accept mass assignment of owner, role or status', async (t) => {
  const f = await fixture(t);
  for (const route of routes.filter((r) =>
    ['POST', 'PATCH', 'DELETE'].includes(r.method),
  )) {
    const response = await f.app.inject({
      ...route,
      headers: {
        ...headers,
        origin: 'https://attacker.invalid',
        cookie: f.cookie,
      },
    });
    assert.equal(response.statusCode, 403);
  }
  for (const extra of [
    { userId: randomUUID() },
    { role: 'admin' },
    { cancelledAt: null },
    { id },
    { permissions: ['reservations:manage'] },
    { room_id: id },
  ]) {
    const response = await f.app.inject({
      method: 'POST',
      url: '/reservations',
      headers: { ...headers, cookie: f.cookie },
      payload: { roomId: id, ...period, ...extra },
    });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(
    (
      await f.app.inject({
        url: `/reservations?${query}&userId=${id}`,
        headers: { cookie: f.cookie },
      })
    ).statusCode,
    400,
  );
  assert.equal(f.calls(), 0);
});

test('business schemas reject malformed dates, unbounded pagination, injection and invalid bodies before SQL', async (t) => {
  const f = await fixture(t);
  f.user.role = 'admin';
  for (const payload of [
    { name: ' ', capacity: 8 },
    { name: 'Good', capacity: '8' },
    { name: 'Good', capacity: 0 },
    { name: 'Good', capacity: 8, role: 'admin' },
    { name: 'Line\nbreak', capacity: 8 },
  ]) {
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/rooms',
          headers: { ...headers, cookie: f.cookie },
          payload,
        })
      ).statusCode,
      400,
    );
  }
  f.user.role = 'user';
  for (const changes of [
    { startsAt: '2035-02-30T12:00:00Z' },
    { startsAt: 'infinity' },
    { startsAt: '2035-01-01T12:00:00' },
    { startsAt: period.endsAt },
    { endsAt: '2037-01-01T12:00:00Z' },
    { startsAt: '2020-01-01T12:00:00Z', endsAt: '2020-01-01T13:00:00Z' },
  ]) {
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/reservations',
          headers: { ...headers, cookie: f.cookie },
          payload: { roomId: id, ...period, ...changes },
        })
      ).statusCode,
      400,
    );
  }
  for (const url of [
    '/rooms?limit=101',
    '/rooms?from=2035-01-01T00:00:00Z',
    '/rooms?from=2035-01-02T00:00:00Z&to=2035-01-01T00:00:00Z',
    '/rooms?offset=10001',
    '/rooms?limit=1&limit=2',
    '/rooms?sort=name;DROP',
    `/reservations?${query}&roomId='OR%20true--`,
    '/reservations?from=invalid',
    '/reservations?from=2035-02-01T00:00:00Z&to=2035-01-01T00:00:00Z',
    `/rooms/${id}/availability?from=infinity&to=infinity`,
    '/rooms/not-a-uuid',
  ])
    assert.equal(
      (await f.app.inject({ url, headers: { cookie: f.cookie } })).statusCode,
      400,
      url,
    );
  assert.equal(f.calls(), 0);
});

test('period rules normalize offsets and reject reversed or excessive windows', () => {
  assert.deepEqual(
    validatePeriod({
      startsAt: '2035-01-01T09:00:00-03:00',
      endsAt: '2035-01-01T10:00:00-03:00',
    }),
    {
      startsAt: '2035-01-01T12:00:00.000Z',
      endsAt: '2035-01-01T13:00:00.000Z',
    },
  );
  for (const input of [
    { startsAt: period.endsAt, endsAt: period.startsAt },
    { startsAt: 'invalid', endsAt: period.endsAt },
    { startsAt: period.startsAt, endsAt: '2037-01-01T00:00:00Z' },
  ])
    assert.throws(() => validatePeriod(input), BusinessError);
});

test('business routes fail closed on session storage errors and redact unexpected database errors', async (t) => {
  const f = await fixture(t);
  const readSession = f.security.readSession.bind(f.security);
  f.security.readSession = async () => {
    throw new Error('redis-private-credential');
  };
  const failedAuth = await f.app.inject({
    url: '/rooms',
    headers: { cookie: f.cookie },
  });
  assert.equal(failedAuth.statusCode, 503);
  assert(!failedAuth.body.includes('redis-private-credential'));
  assert.equal(f.calls(), 0);
  f.security.readSession = readSession;
  f.business.rooms = async () => {
    throw new Error('postgres-private-credential SQL private-data');
  };
  const failedDatabase = await f.app.inject({
    url: '/rooms',
    headers: { cookie: f.cookie },
  });
  assert.equal(failedDatabase.statusCode, 503);
  assert(!failedDatabase.body.includes('private'));
});

test('building inputs and room assignments reject invalid or privileged fields before repository effects', async (t) => {
  const f = await fixture(t);
  f.user.role = 'admin';
  for (const payload of [
    { name: 'Edificio', address: ' ' },
    { name: 'Edificio', address: 'Calle\n123' },
    { name: 'Edificio', address: 'Calle 123', active: 'true' },
    { name: 'Edificio', address: 'Calle 123', userId: id },
    { name: 'Edificio', address: 'Calle 123', role: 'admin' },
  ])
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/buildings',
          headers: { ...headers, cookie: f.cookie },
          payload,
        })
      ).statusCode,
      400,
    );
  for (const buildingId of [null, 'not-a-uuid', { id }])
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/rooms',
          headers: { ...headers, cookie: f.cookie },
          payload: { name: 'Sala', capacity: 8, buildingId },
        })
      ).statusCode,
      400,
    );
  for (const url of [
    '/buildings?limit=101',
    '/buildings?active=true',
    '/rooms?buildingId=invalid',
    `/reservations?${query}&buildingId=invalid`,
  ])
    assert.equal(
      (await f.app.inject({ url, headers: { cookie: f.cookie } })).statusCode,
      url.startsWith('/reservations') ? 403 : 400,
    );
  assert.equal(f.calls(), 0);
});
