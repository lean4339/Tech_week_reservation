import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import pg from 'pg';
import { Redis } from 'ioredis';
import { migrate } from '../dist/db/migrate.js';
import { postgresMetrics } from '../dist/modules/metrics/store.js';
import {
  redisMetrics,
  metricsService,
  metricsKey,
} from '../dist/modules/metrics/cache.js';
import {
  postgresUsers,
  redisSecurity,
  sessionKey,
} from '../dist/auth/stores.js';
import { hashPassword } from '../dist/auth/password.js';
import { buildApp } from '../dist/app.js';
import { headers, cookieFrom, tokenFrom } from './helpers.ts';

test('real Redis metrics cache: exact aggregates, transactional invalidation, expiry and administrator isolation', async (t) => {
  const url = new URL(
    process.env.TEST_DATABASE_URL ??
      'postgresql://tech_week:tech_week_test@127.0.0.1:55432/tech_week_test',
  );
  const redisUrl = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:56379/15';
  assert(url.pathname.endsWith('_test'));
  assert.equal(new URL(redisUrl).pathname, '/15');
  const root = new pg.Pool({ connectionString: url.toString() });
  const name = `metrics_${randomUUID().replaceAll('-', '')}_test`;
  await root.query(`CREATE DATABASE "${name}"`);
  url.pathname = '/' + name;
  const pool = new pg.Pool({ connectionString: url.toString() });
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  const keys = new Set<string>(),
    tokens: string[] = [];
  t.after(async () => {
    for (const key of keys) await redis.del(key);
    for (const token of tokens) await redis.del(sessionKey(token));
    redis.disconnect();
    await pool.end();
    await root.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await root.end();
  });
  await migrate(pool);
  const period = {
    from: '2030-01-02T00:00:00.000Z',
    to: '2030-01-04T00:00:00.000Z',
  };
  const store = postgresMetrics(pool);
  const empty = await store.calculate(period);
  assert.equal(empty.metrics.summary.bookedHours, 0);
  assert.equal(empty.metrics.summary.capacityHours, 0);
  assert.equal(empty.metrics.days.length, 2);
  assert(
    empty.metrics.days.every(
      (day) => day.bookedHours === 0 && day.capacityHours === 0,
    ),
  );
  assert.equal(empty.metrics.hours.length, 24);
  let calculations = 0,
    cacheReads = 0;
  const cache = redisMetrics(redis);
  const service = metricsService(
    {
      ...store,
      async calculate(p) {
        calculations++;
        return store.calculate(p);
      },
    },
    {
      get: (key) => {
        cacheReads++;
        return cache.get(key);
      },
      async set(key, value) {
        keys.add(key);
        await cache.set(key, value);
      },
    },
  );
  const users = postgresUsers(pool),
    security = redisSecurity(redis);
  const app = buildApp({
    stores: { users, security, metrics: service },
    logger: false,
  });
  t.after(() => app.close());
  const password = 'Synthetic metrics test passphrase!';
  const hash = await hashPassword(password);
  const admin = (await users.create(
    `${randomUUID()}@example.test`,
    hash,
    'admin',
  ))!;
  const a = (await users.create(
    `${randomUUID()}@example.test`,
    hash,
    'user',
    'Empresa A',
  ))!;
  const b = (await users.create(
    `${randomUUID()}@example.test`,
    hash,
    'user',
    'Empresa B',
  ))!;
  const building = randomUUID(),
    r1 = randomUUID(),
    r2 = randomUUID();
  await pool.query(
    'INSERT INTO public.buildings (id,name,address) VALUES ($1,$2,$3)',
    [building, 'Sede Central', 'Calle 123'],
  );
  await pool.query(
    `INSERT INTO public.rooms (id,name,capacity,building_id,created_at,active) VALUES ($1,'Sala Uno',10,$3,'2029-01-01',true),($2,'Sala Dos',10,$3,'2029-01-01',false)`,
    [r1, r2, building],
  );
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  for (const [i, room, user, start, end, cancelled] of [
    [0, r1, a.id, '2030-01-01T23:00Z', '2030-01-02T02:00Z', false],
    [1, r1, a.id, '2030-01-02T02:00Z', '2030-01-02T04:00Z', false],
    [2, r1, a.id, '2030-01-02T04:00Z', '2030-01-02T05:00Z', true],
    [3, r2, b.id, '2030-01-03T23:00Z', '2030-01-04T02:00Z', false],
  ] as const)
    await pool.query(
      'INSERT INTO public.reservations (id,room_id,user_id,starts_at,ends_at,cancelled_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [ids[i], room, user, start, end, cancelled ? '2030-01-01' : null],
    );
  const remoteAddress = `127.${randomInt(1, 255)}.${randomInt(1, 255)}.45`;
  async function login(email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers,
      payload: { email, password },
      remoteAddress,
    });
    assert.equal(res.statusCode, 200);
    const cookie = cookieFrom(res);
    tokens.push(tokenFrom(cookie));
    return cookie;
  }
  const adminCookie = await login(admin.email),
    userCookie = await login(a.email);
  const endpoint = '/admin/metrics?' + new URLSearchParams(period);
  async function get() {
    const res = await app.inject({
      url: endpoint,
      headers: { cookie: adminCookie },
      remoteAddress,
    });
    assert.equal(res.statusCode, 200, res.body);
    return res.json();
  }
  const data = await get();
  assert.deepEqual(data.summary, {
    bookedHours: 5,
    reservations: 3,
    cancellations: 1,
    cancellationRate: 25,
    capacityHours: 96,
    occupancyPercent: 5.21,
    rooms: 2,
    clients: 2,
  });
  assert.equal(data.clients[0].name, 'Empresa A');
  assert.equal(data.clients[0].bookedHours, 4);
  assert.equal(data.clients[0].cancellationRate, 33.33);
  assert.equal(data.buildings[0].bookedHours, 5);
  assert.deepEqual(
    data.days.map((d: { bookedHours: number }) => d.bookedHours),
    [4, 1],
  );
  assert.equal(
    data.hours.reduce(
      (sum: number, h: { bookedHours: number }) => sum + h.bookedHours,
      0,
    ),
    5,
  );
  const key = metricsKey(await store.revision(), period);
  assert((await redis.ttl(key)) > 0);
  assert((await redis.ttl(key)) <= 60);
  assert.equal(JSON.parse((await redis.get(key))!).summary.bookedHours, 5);
  await get();
  assert.equal(calculations, 1);
  for (const method of ['GET', 'HEAD'] as const) {
    const res = await app.inject({
      method,
      url: endpoint,
      headers: { cookie: userCookie },
      remoteAddress,
    });
    assert.equal(res.statusCode, 403);
    assert.equal(calculations, 1);
  }
  await pool.query(
    'UPDATE public.reservations SET cancelled_at=now() WHERE id=$1',
    [ids[0]],
  );
  assert.equal((await get()).summary.bookedHours, 3);
  assert.equal(calculations, 2);
  await pool.query(
    "UPDATE public.reservations SET starts_at='2030-01-05T02:00Z',ends_at='2030-01-05T04:00Z' WHERE id=$1",
    [ids[1]],
  );
  assert.equal((await get()).summary.bookedHours, 1);
  await pool.query(
    "UPDATE public.buildings SET name='Sede Nueva' WHERE id=$1",
    [building],
  );
  assert.equal((await get()).buildings[0].name, 'Sede Nueva');
  await pool.query(
    "UPDATE auth.users SET business_name='Empresa Renombrada' WHERE id=$1",
    [b.id],
  );
  assert.equal((await get()).clients[0].name, 'Empresa Renombrada');
  await pool.query(
    "UPDATE public.rooms SET name='Sala Renombrada' WHERE id=$1",
    [r2],
  );
  assert.equal((await get()).rooms[0].name, 'Sala Renombrada');
  const before = await store.revision();
  const connection = await pool.connect();
  await connection.query('BEGIN');
  await connection.query(
    'UPDATE public.reservations SET cancelled_at=now() WHERE id=$1',
    [ids[3]],
  );
  await connection.query('ROLLBACK');
  connection.release();
  assert.equal(await store.revision(), before);
  const currentKey = metricsKey(before, period);
  await redis.set(currentKey, 'invalid-json', 'EX', 60);
  assert.equal((await get()).summary.bookedHours, 1);
  await redis.del(currentKey);
  assert.equal((await get()).summary.bookedHours, 1);
  const quiet = await store.calculate({
    from: '2030-01-10T00:00:00Z',
    to: '2030-01-11T00:00:00Z',
  });
  assert.equal(quiet.metrics.summary.bookedHours, 0);
  assert.equal(quiet.metrics.summary.capacityHours, 48);
  assert.equal(quiet.metrics.days[0].bookedHours, 0);
  assert(!JSON.stringify(data).includes('password'));
  assert(!JSON.stringify(data).includes('@example.test'));

  await t.test(
    'real role revocation, account deactivation and logout block cached metrics without cache reads',
    async () => {
      await get();
      let beforeReads = cacheReads;
      await pool.query("UPDATE auth.users SET role='user' WHERE id=$1", [
        admin.id,
      ]);
      for (const method of ['GET', 'HEAD'] as const) {
        const denied = await app.inject({
          method,
          url: endpoint,
          headers: { cookie: adminCookie, 'x-role': 'admin' },
          remoteAddress,
        });
        assert.equal(denied.statusCode, 403);
        assert.equal(cacheReads, beforeReads);
        assert(!denied.body.includes('Empresa Renombrada'));
      }
      await pool.query("UPDATE auth.users SET role='admin' WHERE id=$1", [
        admin.id,
      ]);
      await get();
      beforeReads = cacheReads;
      await pool.query('UPDATE auth.users SET active=false WHERE id=$1', [
        admin.id,
      ]);
      assert.equal(
        (
          await app.inject({
            url: endpoint,
            headers: { cookie: adminCookie },
            remoteAddress,
          })
        ).statusCode,
        401,
      );
      assert.equal(cacheReads, beforeReads);
      assert.equal(await redis.get(sessionKey(tokenFrom(adminCookie))), null);
      await pool.query('UPDATE auth.users SET active=true WHERE id=$1', [
        admin.id,
      ]);
      assert.equal(
        (
          await app.inject({
            url: endpoint,
            headers: { cookie: adminCookie },
            remoteAddress,
          })
        ).statusCode,
        401,
      );
      const replacement = await login(admin.email);
      assert.equal(
        (
          await app.inject({
            url: endpoint,
            headers: { cookie: replacement },
            remoteAddress,
          })
        ).statusCode,
        200,
      );
      beforeReads = cacheReads;
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/auth/logout',
            headers: { ...headers, cookie: replacement },
            payload: {},
            remoteAddress,
          })
        ).statusCode,
        204,
      );
      for (const method of ['GET', 'HEAD'] as const)
        assert.equal(
          (
            await app.inject({
              method,
              url: endpoint,
              headers: { cookie: replacement },
              remoteAddress,
            })
          ).statusCode,
          401,
        );
      assert.equal(cacheReads, beforeReads);
    },
  );
  await t.test(
    'two real databases sharing Redis and the same revision cannot share private metrics',
    async () => {
      const otherName = `metrics_${randomUUID().replaceAll('-', '')}_test`;
      await root.query(`CREATE DATABASE "${otherName}"`);
      const otherUrl = new URL(url);
      otherUrl.pathname = '/' + otherName;
      const otherPool = new pg.Pool({ connectionString: otherUrl.toString() });
      try {
        await migrate(otherPool);
        const revision = await store.revision();
        const original = await service.get(period);
        assert.equal(original.summary.bookedHours, 1);
        await otherPool.query(
          'UPDATE public.metrics_revision SET revision=$1',
          [revision.split(':')[1]],
        );
        const otherStore = postgresMetrics(otherPool);
        assert.notEqual(await otherStore.revision(), revision);
        const otherService = metricsService(otherStore, {
          get: (key) => cache.get(key),
          async set(key, value) {
            keys.add(key);
            await cache.set(key, value);
          },
        });
        const separate = await otherService.get(period);
        assert.equal(separate.summary.bookedHours, 0);
        assert.equal(separate.clients.length, 0);
        assert(!JSON.stringify(separate).includes('Empresa Renombrada'));
        assert.equal((await service.get(period)).summary.bookedHours, 1);
      } finally {
        await otherPool.end();
        await root.query(`DROP DATABASE "${otherName}" WITH (FORCE)`);
      }
    },
  );
});
