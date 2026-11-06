import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import pg from 'pg';
import { Redis } from 'ioredis';
import { migrate } from '../dist/db/migrate.js';
import { buildApp } from '../dist/app.js';
import {
  postgresUsers,
  redisSecurity,
  sessionKey,
} from '../dist/auth/stores.js';
import { postgresBusiness } from '../dist/business/store.js';
import { hashPassword } from '../dist/auth/password.js';
import { headers } from './helpers.ts';

test('business HTTP API with real PostgreSQL and Redis: CRUD, permissions, isolation and concurrency', async (t) => {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    'postgresql://tech_week:tech_week_test@127.0.0.1:55432/tech_week_test';
  const redisUrl = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:56379/15';
  if (
    !new URL(connectionString).pathname.endsWith('_test') ||
    new URL(redisUrl).pathname !== '/15'
  )
    throw new Error('Dedicated test databases required.');
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2000 });
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  const remoteAddress = `127.${randomInt(1, 255)}.${randomInt(1, 255)}.23`;
  const userIds: string[] = [],
    roomIds: string[] = [],
    buildingIds: string[] = [],
    cookies: string[] = [];
  // Observe query count without replacing SQL, data or authorization controls.
  let queryCount = 0;
  const observedPool = new Proxy(pool, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key === 'query')
        return (...args: unknown[]) => {
          queryCount++;
          return Reflect.apply(value, target, args);
        };
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const users = postgresUsers(pool),
    security = redisSecurity(redis);
  const app = buildApp({
    stores: { users, security, business: postgresBusiness(observedPool) },
    logger: false,
  });
  t.after(async () => {
    await app.close();
    if (redis.status === 'ready')
      for (const cookie of cookies)
        await redis.del(sessionKey(cookie.split('=')[1]!));
    redis.disconnect();
    try {
      await pool.query(
        'DELETE FROM public.reservations WHERE user_id = ANY($1::uuid[])',
        [userIds],
      );
      await pool.query('DELETE FROM public.rooms WHERE id = ANY($1::uuid[])', [
        roomIds,
      ]);
      await pool.query(
        'DELETE FROM public.buildings WHERE id = ANY($1::uuid[])',
        [buildingIds],
      );
      await pool.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[])', [
        userIds,
      ]);
    } finally {
      await pool.end();
    }
  });
  await redis.connect();
  await migrate(pool);
  const password = 'A synthetic business API passphrase!';
  const hash = await hashPassword(password);
  for (const role of ['admin', 'user', 'user'] as const) {
    const user = (await users.create(
      `${randomUUID()}@example.test`,
      hash,
      role,
      role === 'user' ? `Empresa ${userIds.length}` : null,
    ))!;
    userIds.push(user.id);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers,
      payload: { email: user.email, password },
      remoteAddress,
    });
    assert.equal(login.statusCode, 200);
    cookies.push(String(login.headers['set-cookie']).split(';')[0]!);
  }
  const request = (
    actor: number,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    app.inject({
      method,
      url,
      headers: { ...headers, cookie: cookies[actor]! },
      ...(payload === undefined ? {} : { payload }),
      remoteAddress,
    });
  const interval = (day: number) => ({
    startsAt: `2035-01-${String(day).padStart(2, '0')}T12:00:00Z`,
    endsAt: `2035-01-${String(day).padStart(2, '0')}T13:00:00Z`,
  });
  const query = 'from=2035-01-01T00:00:00Z&to=2035-02-01T00:00:00Z';
  await t.test(
    'client directory is admin-only, bounded and excludes credentials and administrators',
    async () => {
      assert.equal((await request(1, 'GET', '/admin/clients')).statusCode, 403);
      const response = await request(
        0,
        'GET',
        '/admin/clients?search=Empresa%202&limit=1',
      );
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json().clients, [
        { id: userIds[2], businessName: 'Empresa 2' },
      ]);
      assert.equal(
        (await request(0, 'GET', '/admin/clients?limit=101')).statusCode,
        400,
      );
      assert.deepEqual(
        (
          await request(0, 'GET', '/admin/clients?search=%27%20OR%20true--')
        ).json().clients,
        [],
      );
    },
  );
  await t.test(
    'admin creates and edits buildings; clients read active buildings but cannot write',
    async () => {
      for (const name of ['Edificio Norte', 'Edificio Sur']) {
        const response = await request(0, 'POST', '/buildings', {
          name,
          address: 'Calle 123',
        });
        assert.equal(response.statusCode, 201, response.body);
        buildingIds.push(response.json().building.id);
      }
      for (const method of ['POST', 'PATCH', 'DELETE'] as const)
        assert.equal(
          (
            await request(
              1,
              method,
              method === 'POST' ? '/buildings' : `/buildings/${buildingIds[0]}`,
              method === 'DELETE'
                ? {}
                : { name: 'Ataque', address: 'Calle ajena' },
            )
          ).statusCode,
          403,
        );
      assert.equal(
        (await request(1, 'GET', '/buildings?limit=1')).json().buildings.length,
        1,
      );
      assert.equal(
        (await request(1, 'GET', `/buildings/${buildingIds[0]}`)).json()
          .building.address,
        'Calle 123',
      );
      const edited = await request(0, 'PATCH', `/buildings/${buildingIds[0]}`, {
        address: "O'Connor 456",
      });
      assert.equal(edited.statusCode, 200);
      assert.equal(edited.json().building.address, "O'Connor 456");
      assert.equal(
        (
          await request(0, 'POST', '/rooms', {
            name: 'Sin edificio',
            capacity: 8,
          })
        ).statusCode,
        400,
      );
      assert.equal(
        (
          await request(0, 'POST', '/rooms', {
            name: 'Edificio ajeno',
            capacity: 8,
            buildingId: randomUUID(),
          })
        ).statusCode,
        404,
      );
    },
  );
  let reservationId: string;

  await t.test(
    'admin manages rooms; clients can read but cannot modify database room rows',
    async () => {
      for (const name of [
        "Sala O'Connor; DROP TABLE public.rooms; --",
        'Sala secundaria',
      ]) {
        const response = await request(0, 'POST', '/rooms', {
          name,
          buildingId: buildingIds[roomIds.length],
          location: 'Piso 1',
          capacity: 8,
        });
        assert.equal(response.statusCode, 201, response.body);
        roomIds.push(response.json().room.id);
        assert.equal(response.json().room.name, name);
      }
      assert.equal(
        (await request(1, 'GET', `/rooms/${roomIds[0]}`)).statusCode,
        200,
      );
      const list = await request(1, 'GET', '/rooms?limit=1&offset=0');
      assert.equal(list.json().rooms.length, 1);
      for (const method of ['PATCH', 'DELETE'] as const) {
        assert.equal(
          (
            await request(
              1,
              method,
              `/rooms/${roomIds[0]}`,
              method === 'PATCH' ? { capacity: 1 } : {},
            )
          ).statusCode,
          403,
        );
      }
      const updated = await request(0, 'PATCH', `/rooms/${roomIds[0]}`, {
        capacity: 12,
        location: null,
      });
      assert.equal(updated.statusCode, 200);
      assert.equal(updated.json().room.capacity, 12);
      assert.equal(updated.json().room.location, null);
      const row = (
        await pool.query(
          'SELECT capacity, active FROM public.rooms WHERE id = $1',
          [roomIds[0]],
        )
      ).rows[0];
      assert.deepEqual(row, { capacity: 12, active: true });
    },
  );

  await t.test(
    'clients reserve and reschedule only their own records; IDOR reads and writes leave the owner data unchanged',
    async () => {
      const created = await request(1, 'POST', '/reservations', {
        roomId: roomIds[0],
        ...interval(2),
      });
      assert.equal(created.statusCode, 201, created.body);
      reservationId = created.json().reservation.id;
      assert.equal(created.json().reservation.userId, userIds[1]);
      const before = (
        await pool.query('SELECT * FROM public.reservations WHERE id = $1', [
          reservationId,
        ])
      ).rows[0];
      for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
        const payload =
          method === 'PATCH'
            ? interval(3)
            : method === 'DELETE'
              ? {}
              : undefined;
        const denied = await request(
          2,
          method,
          `/reservations/${reservationId}`,
          payload,
        );
        const missing = await request(
          2,
          method,
          `/reservations/${randomUUID()}`,
          payload,
        );
        assert.equal(denied.statusCode, 404);
        assert.equal(denied.body, missing.body);
      }
      assert.deepEqual(
        (
          await pool.query('SELECT * FROM public.reservations WHERE id = $1', [
            reservationId,
          ])
        ).rows[0],
        before,
      );
      assert.equal(
        (await request(2, 'GET', `/reservations?${query}`)).json().reservations
          .length,
        0,
      );
      assert.equal(
        (await request(1, 'GET', `/reservations?${query}`)).json()
          .reservations[0].id,
        reservationId,
      );
      const moved = await request(
        1,
        'PATCH',
        `/reservations/${reservationId}`,
        interval(3),
      );
      assert.equal(moved.statusCode, 200, moved.body);
      assert.equal(
        moved.json().reservation.startsAt,
        '2035-01-03T12:00:00.000Z',
      );
      const leak = await request(
        2,
        'GET',
        `/rooms/${roomIds[0]}/availability?from=${interval(3).startsAt}&to=${interval(3).endsAt}`,
      );
      assert.deepEqual(leak.json(), { available: false });
      queryCount = 0;
      const availability = await request(
        2,
        'GET',
        `/rooms?from=${interval(3).startsAt}&to=${interval(3).endsAt}`,
      );
      assert.equal(availability.statusCode, 200);
      assert.equal(queryCount, 1, 'Room availability must not query per room.');
      assert.equal(
        availability
          .json()
          .rooms.find((room: { id: string }) => room.id === roomIds[0])
          .available,
        false,
      );
      assert.equal(
        availability
          .json()
          .rooms.find((room: { id: string }) => room.id === roomIds[1])
          .available,
        true,
      );
      assert(!availability.body.includes(userIds[1]!));
      assert(!availability.body.includes('Empresa 1'));
      assert.equal(
        (await request(1, 'GET', '/admin/reservations?' + query)).statusCode,
        403,
      );
    },
  );

  await t.test(
    'admin can book for clients, filter the joined agenda in one SQL query and manage any reservation',
    async () => {
      const created = await request(0, 'POST', '/admin/reservations', {
        roomId: roomIds[0],
        userId: userIds[2],
        ...interval(4),
      });
      assert.equal(created.statusCode, 201, created.body);
      const id = created.json().reservation.id;
      queryCount = 0;
      const agenda = await request(
        0,
        'GET',
        `/admin/reservations?${query}&roomId=${roomIds[0]}&userId=${userIds[2]}&limit=1`,
      );
      assert.equal(agenda.statusCode, 200, agenda.body);
      assert.equal(queryCount, 1);
      assert.equal(agenda.json().reservations.length, 1);
      assert.equal(agenda.json().reservations[0].id, id);
      assert.equal(agenda.json().reservations[0].businessName, 'Empresa 2');
      assert(agenda.json().reservations[0].roomName.startsWith('Sala'));
      assert(!agenda.body.includes('password_hash'));
      assert(!agenda.body.includes('@example.test'));
      assert.equal(
        (await request(0, 'GET', `/admin/reservations/${id}`)).statusCode,
        200,
      );
      assert.equal(
        (await request(0, 'PATCH', `/admin/reservations/${id}`, interval(5)))
          .statusCode,
        200,
      );
      assert.equal(
        (await request(0, 'DELETE', `/admin/reservations/${id}`, {}))
          .statusCode,
        200,
      );
      for (const userId of [userIds[0], randomUUID()]) {
        assert.equal(
          (
            await request(0, 'POST', '/admin/reservations', {
              roomId: roomIds[0],
              userId,
              ...interval(6),
            })
          ).statusCode,
          404,
        );
      }
      await pool.query('UPDATE auth.users SET active = false WHERE id = $1', [
        userIds[2],
      ]);
      assert.equal(
        (
          await request(0, 'POST', '/admin/reservations', {
            roomId: roomIds[0],
            userId: userIds[2],
            ...interval(6),
          })
        ).statusCode,
        404,
      );
      await pool.query('UPDATE auth.users SET active = true WHERE id = $1', [
        userIds[2],
      ]);
    },
  );

  await t.test(
    'conflicts return 409 without SQL details; updates roll back; adjacent reservations and cancellation work',
    async () => {
      const conflict = await request(2, 'POST', '/reservations', {
        roomId: roomIds[0],
        ...interval(3),
      });
      assert.equal(conflict.statusCode, 409, conflict.body);
      for (const secret of [
        'reservations_no_overlap',
        'INSERT',
        userIds[1]!,
        reservationId,
      ])
        assert(!conflict.body.includes(secret));
      const adjacent = await request(2, 'POST', '/reservations', {
        roomId: roomIds[0],
        startsAt: interval(3).endsAt,
        endsAt: '2035-01-03T14:00:00Z',
      });
      assert.equal(adjacent.statusCode, 201);
      const moved = await request(
        1,
        'PATCH',
        `/reservations/${reservationId}`,
        { startsAt: interval(3).startsAt, endsAt: '2035-01-03T14:00:00Z' },
      );
      assert.equal(moved.statusCode, 409);
      assert.equal(
        (await request(1, 'GET', `/reservations/${reservationId}`)).json()
          .reservation.endsAt,
        '2035-01-03T13:00:00.000Z',
      );
      const cancelled = await request(
        1,
        'DELETE',
        `/reservations/${reservationId}`,
        {},
      );
      assert.equal(cancelled.statusCode, 200);
      assert(cancelled.json().reservation.cancelledAt);
      assert.equal(
        (
          await request(1, 'DELETE', `/reservations/${reservationId}`, {})
        ).json().reservation.cancelledAt,
        cancelled.json().reservation.cancelledAt,
      );
      assert.equal(
        (
          await request(1, 'GET', `/reservations?${query}&status=cancelled`)
        ).json().reservations[0].id,
        reservationId,
      );
      assert.equal(
        (
          await request(
            1,
            'PATCH',
            `/reservations/${reservationId}`,
            interval(7),
          )
        ).statusCode,
        409,
      );
      assert.equal(
        (
          await request(2, 'POST', '/reservations', {
            roomId: roomIds[0],
            ...interval(3),
          })
        ).statusCode,
        201,
      );
    },
  );

  await t.test(
    'concurrent API creates and reschedules have one winner; the other receives a controlled conflict',
    async () => {
      const responses = await Promise.all(
        [1, 2].map((actor) =>
          request(actor, 'POST', '/reservations', {
            roomId: roomIds[0],
            ...interval(10),
          }),
        ),
      );
      assert.deepEqual(responses.map((r) => r.statusCode).sort(), [201, 409]);
      const ids: string[] = [];
      for (const [actor, day] of [
        [1, 11],
        [2, 12],
      ]) {
        const response = await request(actor!, 'POST', '/reservations', {
          roomId: roomIds[0],
          ...interval(day!),
        });
        assert.equal(response.statusCode, 201);
        ids.push(response.json().reservation.id);
      }
      const reschedules = await Promise.all(
        ids.map((id, index) =>
          request(index + 1, 'PATCH', `/reservations/${id}`, interval(13)),
        ),
      );
      assert.deepEqual(reschedules.map((r) => r.statusCode).sort(), [200, 409]);
      const count = await pool.query(
        "SELECT count(*) FROM public.reservations WHERE room_id = $1 AND starts_at = '2035-01-13T12:00:00Z' AND cancelled_at IS NULL",
        [roomIds[0]],
      );
      assert.equal(count.rows[0].count, '1');
    },
  );

  await t.test(
    'deactivated rooms cannot be newly booked; history stays accessible and active room state is rechecked',
    async () => {
      const response = await request(0, 'DELETE', `/rooms/${roomIds[0]}`, {});
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().room.active, false);
      assert.equal(
        (await request(1, 'GET', `/rooms/${roomIds[0]}`)).statusCode,
        404,
      );
      assert.equal(
        (await request(0, 'GET', `/rooms/${roomIds[0]}`)).statusCode,
        200,
      );
      assert.equal(
        (
          await request(1, 'POST', '/reservations', {
            roomId: roomIds[0],
            ...interval(20),
          })
        ).statusCode,
        409,
      );
      assert.equal(
        (await request(1, 'GET', `/reservations/${reservationId}`)).statusCode,
        200,
      );
      assert.equal(
        (await request(0, 'PATCH', `/rooms/${roomIds[0]}`, { active: true }))
          .statusCode,
        200,
      );
      assert.equal(
        (
          await request(1, 'POST', '/reservations', {
            roomId: roomIds[0],
            ...interval(20),
          })
        ).statusCode,
        201,
      );
      // Force lock ordering: reserve waits behind an uncommitted deactivation and must observe its result.
      const lock = await pool.connect();
      try {
        await lock.query('BEGIN');
        await lock.query(
          'UPDATE public.rooms SET active = false WHERE id = $1',
          [roomIds[1]],
        );
        const pending = Promise.resolve(
          request(1, 'POST', '/reservations', {
            roomId: roomIds[1],
            ...interval(21),
          }),
        );
        let waiting = false;
        try {
          for (let attempt = 0; attempt < 100; attempt++) {
            const state = await pool.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'SELECT active%FROM public.rooms%'",
            );
            if (state.rows.length) {
              waiting = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        } finally {
          await lock.query('COMMIT');
        }
        assert(waiting, 'Reservation must actually wait for the room lock.');
        assert.equal((await pending).statusCode, 409);
        assert.equal(
          (
            await pool.query(
              'SELECT count(*) FROM public.reservations WHERE room_id = $1',
              [roomIds[1]],
            )
          ).rows[0].count,
          '0',
        );
      } finally {
        await lock.query('ROLLBACK');
        lock.release();
      }
    },
  );
  await t.test(
    'building filters use one query; room moves with history are rejected; legacy assignments preserve reservations',
    async () => {
      queryCount = 0;
      const filtered = await request(
        0,
        'GET',
        `/rooms?buildingId=${buildingIds[0]}`,
      );
      assert.equal(queryCount, 1);
      assert.deepEqual(
        filtered.json().rooms.map((room: { id: string }) => room.id),
        [roomIds[0]],
      );
      const agenda = await request(
        0,
        'GET',
        `/admin/reservations?${query}&buildingId=${buildingIds[0]}&status=all`,
      );
      assert(agenda.json().reservations.length > 0);
      assert(
        agenda
          .json()
          .reservations.every(
            (row: { buildingId: string; buildingName: string }) =>
              row.buildingId === buildingIds[0] &&
              row.buildingName === 'Edificio Norte',
          ),
      );
      assert.equal(
        (
          await request(0, 'PATCH', `/rooms/${roomIds[0]}`, {
            buildingId: buildingIds[1],
          })
        ).statusCode,
        409,
      );
      assert.equal(
        (await request(0, 'GET', `/rooms/${roomIds[0]}`)).json().room
          .buildingId,
        buildingIds[0],
      );
      await assert.rejects(
        pool.query('DELETE FROM public.buildings WHERE id = $1', [
          buildingIds[0],
        ]),
        { code: '23001' },
      );
      const legacy = (
        await pool.query(
          "INSERT INTO public.rooms (name, capacity) VALUES ('Sala heredada', 8) RETURNING id",
        )
      ).rows[0].id;
      roomIds.push(legacy);
      assert.equal(
        (await request(0, 'GET', `/rooms/${legacy}`)).json().room.buildingId,
        null,
      );
      assert.equal(
        (await request(1, 'GET', `/rooms/${legacy}`)).statusCode,
        404,
      );
      assert.equal(
        (
          await request(1, 'POST', '/reservations', {
            roomId: legacy,
            ...interval(25),
          })
        ).statusCode,
        409,
      );
      const oldReservation = (
        await pool.query(
          'INSERT INTO public.reservations (room_id, user_id, starts_at, ends_at) VALUES ($1,$2,$3,$4) RETURNING id',
          [legacy, userIds[1], interval(25).startsAt, interval(25).endsAt],
        )
      ).rows[0].id;
      assert.equal(
        (await request(1, 'GET', `/reservations/${oldReservation}`)).json()
          .reservation.buildingId,
        null,
      );
      assert.equal(
        (
          await request(0, 'PATCH', `/rooms/${legacy}`, {
            buildingId: buildingIds[0],
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (await request(1, 'GET', `/reservations/${oldReservation}`)).json()
          .reservation.buildingId,
        buildingIds[0],
      );
    },
  );
  await t.test(
    'reservation dates are optional and independent while ownership, pagination and other filters remain enforced',
    async () => {
      const past = (
        await pool.query(
          "INSERT INTO public.reservations (room_id,user_id,starts_at,ends_at) VALUES ($1,$2,'2001-01-01T12:00:00Z','2001-01-01T13:00:00Z') RETURNING id",
          [roomIds[0], userIds[1]],
        )
      ).rows[0].id;
      const future = await request(1, 'POST', '/reservations', {
        roomId: roomIds[0],
        startsAt: '2040-01-01T12:00:00Z',
        endsAt: '2040-01-01T13:00:00Z',
      });
      assert.equal(future.statusCode, 201);
      const futureId = future.json().reservation.id;
      queryCount = 0;
      const all = await request(1, 'GET', '/reservations');
      assert.equal(all.statusCode, 200);
      assert.equal(queryCount, 1);
      assert(
        all.json().reservations.some((row: { id: string }) => row.id === past),
      );
      assert(
        all
          .json()
          .reservations.some((row: { id: string }) => row.id === futureId),
      );
      assert(
        all
          .json()
          .reservations.every(
            (row: { userId: string }) => row.userId === userIds[1],
          ),
      );
      const first = await request(1, 'GET', '/reservations?limit=1');
      assert.deepEqual(
        first.json().reservations.map((row: { id: string }) => row.id),
        [past],
      );
      const next = await request(1, 'GET', '/reservations?limit=1&offset=1');
      assert.equal(next.json().reservations.length, 1);
      assert.notEqual(next.json().reservations[0].id, past);
      for (const [suffix, id] of [
        ['from=2040-01-01T00:00:00Z', futureId],
        ['to=2002-01-01T00:00:00Z', past],
      ]) {
        const filtered = await request(1, 'GET', `/reservations?${suffix}`);
        assert.deepEqual(
          filtered.json().reservations.map((row: { id: string }) => row.id),
          [id],
        );
      }
      assert.equal(
        (
          await request(
            1,
            'GET',
            '/reservations?from=2000-01-01T00:00:00Z&to=2041-01-01T00:00:00Z',
          )
        ).statusCode,
        200,
      );
      const admin = await request(
        0,
        'GET',
        `/admin/reservations?userId=${userIds[2]}&buildingId=${buildingIds[0]}`,
      );
      assert.equal(admin.statusCode, 200);
      assert(admin.json().reservations.length > 0);
      assert(
        admin
          .json()
          .reservations.every(
            (row: { userId: string; buildingId: string }) =>
              row.userId === userIds[2] && row.buildingId === buildingIds[0],
          ),
      );
      assert.equal(
        (await request(1, 'GET', '/admin/reservations')).statusCode,
        403,
      );
      assert.equal(
        (await request(1, 'GET', `/reservations?userId=${userIds[2]}`))
          .statusCode,
        400,
      );
      assert.equal(
        (await request(1, 'GET', '/reservations?limit=101')).statusCode,
        400,
      );
    },
  );
  await t.test(
    'building deactivation serializes with bookings, hides rooms and preserves history',
    async () => {
      const lock = await pool.connect();
      try {
        await lock.query('BEGIN');
        await lock.query(
          'UPDATE public.buildings SET active = false WHERE id = $1',
          [buildingIds[0]],
        );
        const pending = Promise.resolve(
          request(1, 'POST', '/reservations', {
            roomId: roomIds[0],
            ...interval(26),
          }),
        );
        let waiting = false;
        try {
          for (let attempt = 0; attempt < 100; attempt++) {
            const state = await pool.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'SELECT active FROM public.buildings%'",
            );
            if (state.rows.length) {
              waiting = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        } finally {
          await lock.query('COMMIT');
        }
        const response = await pending;
        assert(waiting, 'Reservation must wait for the building lock.');
        assert.equal(response.statusCode, 409, response.body);
      } finally {
        await lock.query('ROLLBACK');
        lock.release();
      }
      assert.equal(
        (await request(1, 'GET', `/buildings/${buildingIds[0]}`)).statusCode,
        404,
      );
      assert.equal(
        (await request(0, 'GET', `/buildings/${buildingIds[0]}`)).json()
          .building.active,
        false,
      );
      assert.deepEqual(
        (await request(1, 'GET', `/rooms?buildingId=${buildingIds[0]}`)).json()
          .rooms,
        [],
      );
      assert.equal(
        (
          await request(
            0,
            'GET',
            `/rooms/${roomIds[0]}/availability?from=${interval(26).startsAt}&to=${interval(26).endsAt}`,
          )
        ).json().available,
        false,
      );
      assert.equal(
        (await request(1, 'GET', `/reservations/${reservationId}`)).statusCode,
        200,
      );
      assert.equal(
        (
          await request(0, 'POST', '/rooms', {
            name: 'Sala bloqueada',
            buildingId: buildingIds[0],
            capacity: 8,
          })
        ).statusCode,
        409,
      );
      assert.equal(
        (
          await request(0, 'PATCH', `/buildings/${buildingIds[0]}`, {
            active: true,
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (
          await request(1, 'POST', '/reservations', {
            roomId: roomIds[0],
            ...interval(26),
          })
        ).statusCode,
        201,
      );
      assert.equal(
        (await request(0, 'DELETE', `/buildings/${buildingIds[0]}`, {}))
          .statusCode,
        200,
      );
    },
  );
});
