import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { buildApp } from '../dist/app.js';
import { metricsService, metricsKey } from '../dist/modules/metrics/cache.js';
import { MemoryUsers, MemorySecurity } from './helpers.ts';
import type { Metrics, MetricsPeriod } from '../src/modules/metrics/model.ts';

const period = {
  from: '2030-01-01T00:00:00.000Z',
  to: '2030-01-02T00:00:00.000Z',
};
const fixture = (p = period): Metrics => ({
  period: p,
  generatedAt: period.to,
  timezone: 'UTC',
  capacityBasis: 'registered-rooms-24h',
  rankingLimit: 100,
  summary: {
    bookedHours: 0,
    reservations: 0,
    cancellations: 0,
    cancellationRate: 0,
    capacityHours: 0,
    occupancyPercent: 0,
    rooms: 0,
    clients: 0,
  },
  rooms: [],
  buildings: [],
  clients: [],
  days: [],
  hours: [],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function identity(users: MemoryUsers, security: MemorySecurity) {
  const user = (await users.create('admin@example.test', 'unused', 'admin'))!;
  const token = randomBytes(32).toString('base64url');
  security.sessions.set(token, {
    userId: user.id,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  return { user, token, cookie: `tech_week_session=${token}` };
}

test('metrics rejects idle, revoked and inactive identities and storage failures before any metrics reads', async (t) => {
  const users = new MemoryUsers(),
    security = new MemorySecurity();
  let reads = 0;
  const app = buildApp({
    stores: {
      users,
      security,
      metrics: {
        async get() {
          reads++;
          return fixture();
        },
      },
    },
    logger: false,
  });
  t.after(() => app.close());
  const { user, token, cookie } = await identity(users, security);
  const request = () =>
    app.inject({ url: '/admin/metrics', headers: { cookie } });
  assert.equal((await request()).statusCode, 200);
  assert.equal(reads, 1);
  security.sessions.get(token)!.lastSeenAt = Date.now() - 31 * 60 * 1000;
  assert.equal((await request()).statusCode, 401);
  assert.equal(reads, 1);
  security.sessions.set(token, {
    userId: user.id,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  user.active = false;
  assert.equal((await request()).statusCode, 401);
  assert(!security.sessions.has(token));
  assert.equal(reads, 1);
  user.active = true;
  assert.equal((await request()).statusCode, 401);
  assert.equal(reads, 1);
  security.readSession = async () => {
    throw Error('redis://private-session-secret');
  };
  const failed = await request();
  assert.equal(failed.statusCode, 503);
  assert(!failed.body.includes('private-session-secret'));
  assert.equal(reads, 1);
  security.readSession = async () => ({
    userId: user.id,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  users.findById = async () => {
    throw Error('postgresql://private-database-secret');
  };
  const dbFailed = await request();
  assert.equal(dbFailed.statusCode, 503);
  assert(!dbFailed.body.includes('private-database-secret'));
  assert.equal(reads, 1);
});

test('metrics rejects duplicated parameters, encoded injection and query objects before calculations', async (t) => {
  const users = new MemoryUsers(),
    security = new MemorySecurity();
  let calls = 0;
  const app = buildApp({
    stores: {
      users,
      security,
      metrics: {
        async get() {
          calls++;
          return fixture();
        },
      },
    },
    logger: false,
  });
  t.after(() => app.close());
  const { cookie } = await identity(users, security);
  const valid = new URLSearchParams(period).toString();
  const attempts = [
    `${valid}&from=${encodeURIComponent(period.from)}`,
    `${valid}&to=${encodeURIComponent(period.to)}`,
    `${valid}&__proto__[admin]=true`,
    `${valid}&constructor[prototype][admin]=true`,
    `${valid}&from[$ne]=null`,
    `${valid}&role=admin`,
    new URLSearchParams({
      from: "2030-01-01'; SELECT pg_sleep(10); --",
      to: period.to,
    }).toString(),
    new URLSearchParams({
      from: '2030-01-01T00:00:00Z\r\nX-Injected: yes',
      to: period.to,
    }).toString(),
  ];
  for (const query of attempts) {
    const result = await app.inject({
      url: '/admin/metrics?' + query,
      headers: { cookie },
    });
    assert.equal(result.statusCode, 400, query);
    assert.equal(calls, 0);
    assert(!result.body.includes('pg_sleep'));
  }
  assert.equal(Object.hasOwn(Object.prototype, 'admin'), false);
  assert.equal(security.sessions.size, 1);
});

test('metrics rate limit runs before cache access and forwarded IPs cannot bypass it', async (t) => {
  const users = new MemoryUsers(),
    security = new MemorySecurity();
  let calls = 0;
  const app = buildApp({
    stores: {
      users,
      security,
      metrics: {
        async get() {
          calls++;
          return fixture();
        },
      },
    },
    logger: false,
  });
  t.after(() => app.close());
  const { cookie } = await identity(users, security);
  security.counts.set('requests:127.0.0.1', 120);
  for (const ip of ['198.51.100.1', '198.51.100.2']) {
    const res = await app.inject({
      url: '/admin/metrics',
      headers: { cookie, 'x-forwarded-for': ip, 'x-real-ip': ip },
    });
    assert.equal(res.statusCode, 429);
    assert.equal(calls, 0);
  }
});

test('concurrent cache misses share one calculation; a rejected calculation is evicted and retry recovers', async () => {
  let calls = 0,
    writes = 0;
  let barrier = deferred<{ revision: string; metrics: Metrics }>();
  let started = deferred<void>();
  const service = metricsService(
    {
      async revision() {
        return 'generation:1';
      },
      async calculate() {
        calls++;
        started.resolve();
        return barrier.promise;
      },
    },
    {
      async get() {
        return null;
      },
      async set() {
        writes++;
      },
    },
  );
  const failed = Promise.allSettled(
    Array.from({ length: 8 }, () => service.get(period)),
  );
  await started.promise;
  barrier.reject(Error('synthetic calculation failure'));
  assert((await failed).every((result) => result.status === 'rejected'));
  assert.equal(calls, 1);
  assert.equal(writes, 0);
  barrier = deferred();
  started = deferred();
  const recovered = Promise.all(
    Array.from({ length: 8 }, () => service.get(period)),
  );
  await started.promise;
  barrier.resolve({ revision: 'generation:1', metrics: fixture() });
  assert.equal((await recovered).length, 8);
  assert.equal(calls, 2);
  assert.equal(writes, 1);
});

test('cache keys separate database generations and periods; mismatched cached periods are never returned', async () => {
  const other = {
    from: '2030-02-01T00:00:00.000Z',
    to: '2030-02-02T00:00:00.000Z',
  };
  assert.notEqual(
    metricsKey('database-A:1', period),
    metricsKey('database-B:1', period),
  );
  assert.notEqual(
    metricsKey('database-A:1', period),
    metricsKey('database-A:1', other),
  );
  let calls = 0;
  const records = new Map<string, Metrics>();
  const service = metricsService(
    {
      async revision() {
        return 'database-A:1';
      },
      async calculate(p: MetricsPeriod) {
        calls++;
        return { revision: 'database-A:1', metrics: fixture(p) };
      },
    },
    {
      async get(key) {
        return records.get(key) ?? null;
      },
      async set(key, value) {
        records.set(key, value);
      },
    },
  );
  records.set(metricsKey('database-A:1', period), fixture(other));
  assert.deepEqual((await service.get(period)).period, period);
  assert.equal(calls, 1);
  await Promise.all([service.get(period), service.get(other)]);
  assert.equal(calls, 2);
  assert.deepEqual(
    records.get(metricsKey('database-A:1', period))!.period,
    period,
  );
  assert.deepEqual(
    records.get(metricsKey('database-A:1', other))!.period,
    other,
  );
});

test('failed metrics calculations never publish a cache entry or expose database errors through HTTP', async (t) => {
  const users = new MemoryUsers(),
    security = new MemorySecurity();
  let writes = 0;
  const metrics = metricsService(
    {
      async revision() {
        return '1';
      },
      async calculate() {
        throw Error('SELECT private_customer_secret FROM credentials');
      },
    },
    {
      async get() {
        return null;
      },
      async set() {
        writes++;
      },
    },
  );
  const app = buildApp({ stores: { users, security, metrics }, logger: false });
  t.after(() => app.close());
  const { cookie } = await identity(users, security);
  const response = await app.inject({
    url: '/admin/metrics',
    headers: { cookie },
  });
  assert.equal(response.statusCode, 503);
  assert.equal(writes, 0);
  assert(!response.body.includes('private_customer_secret'));
  assert(!response.body.includes('SELECT'));
});
