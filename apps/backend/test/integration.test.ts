import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import pg from 'pg';
import { Redis } from 'ioredis';
import { migrate } from '../dist/db/migrate.js';
import {
  postgresUsers,
  redisSecurity,
  sessionKey,
} from '../dist/auth/stores.js';
import { hashPassword } from '../dist/auth/password.js';
import { buildApp } from '../dist/app.js';
import { IDLE_MS, ABSOLUTE_MS } from '../dist/auth/model.js';

test('real PostgreSQL migrations, constraints, Redis sessions, TTLs, audit and HTTP authorization', async (t) => {
  const databaseUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://tech_week:tech_week_test@127.0.0.1:55432/tech_week_test';
  const redisUrl = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:56379/15';
  if (
    !new URL(databaseUrl).pathname.endsWith('_test') ||
    new URL(redisUrl).pathname !== '/15'
  ) {
    throw new Error(
      'Use a dedicated database ending in _test and Redis database 15.',
    );
  }
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
  });
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 2000,
    retryStrategy: () => null,
    maxRetriesPerRequest: 0,
  });
  redis.on('error', () => {});
  const ids: string[] = [];
  const tokens: string[] = [];
  t.after(async () => {
    if (redis.status === 'ready')
      for (const token of tokens) await redis.del(sessionKey(token));
    redis.disconnect();
    if (ids.length)
      await pool.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[])', [
        ids,
      ]);
    await pool.end();
  });
  await pool.query('SELECT 1');
  await redis.connect();
  await migrate(pool);
  await migrate(pool);
  assert.equal(
    (
      await pool.query(
        'SELECT count(*) FROM auth.schema_migrations WHERE name = $1',
        ['001_auth.sql'],
      )
    ).rows[0].count,
    '1',
  );
  const users = postgresUsers(pool);
  const security = redisSecurity(redis);
  const email = `${randomUUID()}@example.test`;
  const password = 'An isolated integration passphrase!';
  const hash = await hashPassword(password);
  const businessName = "Café O'Connor; DROP TABLE auth.users; --";
  const duplicates = await Promise.all([
    users.create(email, hash, 'user', businessName),
    users.create(email, hash, 'user', businessName),
  ]);
  assert.equal(duplicates.filter(Boolean).length, 1);
  const user = duplicates.find(Boolean)!;
  ids.push(user.id);
  assert.equal(user.business_name, businessName);
  assert.equal((await users.findById(user.id))!.business_name, businessName);
  for (const invalid of ['', 'A', ' padded ', 'a'.repeat(121), 'Acme\nInc']) {
    await assert.rejects(
      pool.query('UPDATE auth.users SET business_name = $1 WHERE id = $2', [
        invalid,
        user.id,
      ]),
    );
  }
  assert.equal((await users.findByEmail(email))!.business_name, businessName);
  const legacy = await users.create(
    `${randomUUID()}@example.test`,
    hash,
    'admin',
  );
  assert(legacy);
  ids.push(legacy.id);
  assert.equal(legacy.business_name, null);
  assert.equal(await users.findByEmail("' OR true --"), null);
  await assert.rejects(
    pool.query('UPDATE auth.users SET role = $1 WHERE id = $2', [
      'superadmin',
      user.id,
    ]),
    { code: '23514' },
  );
  assert.equal((await users.findById(user.id))!.role, 'user');

  const app = buildApp({ stores: { users, security }, logger: false });
  t.after(() => app.close());
  const headers = {
    origin: 'http://localhost:3000',
    'x-requested-with': 'tech-week-web',
  };
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers,
    payload: { email, password },
  });
  assert.equal(login.statusCode, 200);
  assert.equal(login.json().user.businessName, businessName);
  const cookie = String(login.headers['set-cookie']).split(';')[0]!;
  const token = cookie.split('=')[1]!;
  tokens.push(token);
  assert(await redis.get(sessionKey(token)));
  assert.equal(await redis.get(token), null);
  const ttl = await redis.pttl(sessionKey(token));
  assert(ttl > 0 && ttl <= IDLE_MS);
  assert.equal(
    (await app.inject({ url: '/admin/auth-events', headers: { cookie } }))
      .statusCode,
    403,
  );
  await pool.query("UPDATE auth.users SET role = 'admin' WHERE id = $1", [
    user.id,
  ]);
  assert.equal(
    (await app.inject({ url: '/admin/auth-events', headers: { cookie } }))
      .statusCode,
    200,
  );
  await pool.query("UPDATE auth.users SET role = 'user' WHERE id = $1", [
    user.id,
  ]);
  assert.equal(
    (await app.inject({ url: '/admin/overview', headers: { cookie } }))
      .statusCode,
    403,
  );
  await app.inject({
    method: 'POST',
    url: '/auth/logout',
    headers: { ...headers, cookie },
    payload: {},
  });
  assert.equal(await security.readSession(token), null);
  assert.equal(await redis.exists(sessionKey(token)), 0);

  await t.test(
    'idle and absolute expiry, rotation and atomic rate limiting',
    async () => {
      const old = randomBytes(32).toString('base64url');
      const next = randomBytes(32).toString('base64url');
      tokens.push(old, next);
      const now = Date.now();
      await security.createSession(old, {
        userId: user.id,
        createdAt: now,
        lastSeenAt: now,
      });
      await security.createSession(
        next,
        { userId: user.id, createdAt: now, lastSeenAt: now },
        old,
      );
      assert.equal(await security.readSession(old), null);
      assert(await security.readSession(next));
      for (const session of [
        { userId: user.id, createdAt: now - ABSOLUTE_MS, lastSeenAt: now },
        { userId: user.id, createdAt: now, lastSeenAt: now - IDLE_MS },
      ]) {
        await redis.set(
          sessionKey(next),
          JSON.stringify(session),
          'PX',
          IDLE_MS,
        );
        assert.equal(await security.readSession(next), null);
      }
      const key = `integration:${randomUUID()}`;
      const attempts = await Promise.all(
        Array.from({ length: 20 }, () => security.consume(key, 10, 60)),
      );
      assert.equal(attempts.filter(Boolean).length, 10);
    },
  );

  const records = await security.events();
  assert(
    records.some((r) => r.event === 'login_succeeded' && r.userId === user.id),
  );
  for (const secret of [password, hash, token, email])
    assert(!JSON.stringify(records).includes(secret));
  const auditTtl = await redis.ttl(
    `tech-week:audit:${new Date().toISOString().slice(0, 10)}`,
  );
  assert(auditTtl > 0 && auditTtl <= 7 * 86400);
  const requestRecords = await security.requests();
  assert(
    requestRecords.some(
      (r) =>
        r.route === '/auth/login' && r.status === 200 && r.ip === '127.0.0.1',
    ),
  );
  for (const secret of [password, hash, token, email])
    assert(!JSON.stringify(requestRecords).includes(secret));
  const requestTtl = await redis.ttl(
    `tech-week:requests:${new Date().toISOString().slice(0, 10)}`,
  );
  assert(requestTtl > 0 && requestTtl <= 7 * 86400);
});
