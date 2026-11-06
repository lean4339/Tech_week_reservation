import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { buildApp } from '../dist/app.js';
import { MemoryUsers, MemorySecurity } from './helpers.ts';
import { metricsPeriod } from '../dist/metrics/routes.js';
import { metricsService, metricsKey } from '../dist/metrics/cache.js';
import type { Metrics, MetricsPeriod } from '../src/metrics/model.ts';

const period = {
  from: '2030-01-01T00:00:00.000Z',
  to: '2030-01-02T00:00:00.000Z',
};
const fixture = (p = period) =>
  ({ period: p, generatedAt: '2030-01-02T00:00:00.000Z' }) as Metrics;

test('metrics authentication and admin permission run before any cache or business reads, including HEAD', async (t) => {
  const users = new MemoryUsers(),
    security = new MemorySecurity();
  let calls = 0;
  const app = buildApp({
    stores: {
      users,
      security,
      metrics: {
        async get(p) {
          calls++;
          return fixture(p);
        },
      },
    },
    logger: false,
  });
  t.after(() => app.close());
  const user = (await users.create('client@example.test', 'unused', 'user'))!;
  const admin = (await users.create('admin@example.test', 'unused', 'admin'))!;
  const cookie = async (id: string, age = 0) => {
    const token = randomBytes(32).toString('base64url');
    await security.createSession(token, {
      userId: id,
      createdAt: Date.now() - age,
      lastSeenAt: Date.now() - age,
    });
    return `tech_week_session=${token}`;
  };
  const clientCookie = await cookie(user.id),
    adminCookie = await cookie(admin.id);
  for (const method of ['GET', 'HEAD'] as const) {
    for (const [value, status] of [
      [undefined, 401],
      ['tech_week_session=forged', 401],
      [await cookie(admin.id, 9 * 3600000), 401],
      [clientCookie, 403],
    ] as const) {
      const response = await app.inject({
        method,
        url: '/admin/metrics?from=invalid',
        headers: {
          ...(value ? { cookie: value } : {}),
          'x-role': 'admin',
          'x-user-id': admin.id,
        },
      });
      assert.equal(response.statusCode, status);
      assert.equal(calls, 0);
    }
  }
  for (const query of [
    '?from=invalid',
    '?from=2030-01-01T00:00:00Z',
    '?userId=' + user.id,
    '?from=2030-01-01T00:00:00Z&to=2032-01-01T00:00:00Z',
    '?from=2031-01-01T00:00:00Z&to=2030-01-01T00:00:00Z',
  ]) {
    assert.equal(
      (
        await app.inject({
          url: '/admin/metrics' + query,
          headers: { cookie: adminCookie },
        })
      ).statusCode,
      400,
    );
    assert.equal(calls, 0);
  }
  const valid = await app.inject({
    url: '/admin/metrics',
    headers: { cookie: adminCookie },
  });
  assert.equal(valid.statusCode, 200);
  assert.equal(calls, 1);
  assert.match(String(valid.headers['cache-control']), /no-store/);
  admin.role = 'user';
  assert.equal(
    (
      await app.inject({
        url: '/admin/metrics',
        headers: { cookie: adminCookie },
      })
    ).statusCode,
    403,
  );
  assert.equal(calls, 1);
});

test('metrics defaults need no filters, normalize timezones and cap query periods', () => {
  assert.deepEqual(metricsPeriod({}, new Date('2030-02-01T12:34:56Z')), {
    from: '2030-01-03T00:00:00.000Z',
    to: '2030-02-02T00:00:00.000Z',
  });
  assert.deepEqual(
    metricsPeriod({
      from: '2029-12-31T21:00:00-03:00',
      to: '2030-01-01T21:00:00-03:00',
    }),
    period,
  );
  assert.throws(() => metricsPeriod({ from: period.to, to: period.from }));
});

test('Redis generations prevent stale snapshot races; cache loss falls back and PostgreSQL failure fails closed', async () => {
  let revision = '1',
    calls = 0;
  const entries = new Map<string, Metrics>();
  const store = {
    async revision() {
      return revision;
    },
    async calculate(p: MetricsPeriod) {
      calls++;
      return { revision, metrics: fixture(p) };
    },
  };
  const cache = {
    async get(key: string) {
      return entries.get(key) ?? null;
    },
    async set(key: string, value: Metrics) {
      entries.set(key, value);
    },
  };
  const service = metricsService(store, cache);
  await service.get(period);
  await service.get(period);
  assert.equal(calls, 1);
  revision = '2';
  await service.get(period);
  assert.equal(calls, 2);
  // A calculation began before a committed write and finishes after it.
  store.calculate = async (p) => {
    calls++;
    const snapshot = revision;
    revision = '4';
    return { revision: snapshot, metrics: fixture(p) };
  };
  revision = '3';
  await service.get(period);
  assert(entries.has(metricsKey('3', period)));
  assert(!entries.has(metricsKey('4', period)));
  await service.get(period);
  assert.equal(calls, 4);
  const unavailable = metricsService(store, {
    async get() {
      throw Error('Redis unavailable');
    },
    async set() {
      throw Error('Redis unavailable');
    },
  });
  assert.deepEqual((await unavailable.get(period)).period, period);
  const broken = metricsService(
    {
      ...store,
      async revision() {
        throw Error('PostgreSQL unavailable');
      },
    },
    cache,
  );
  await assert.rejects(broken.get(period), /PostgreSQL unavailable/);
});
