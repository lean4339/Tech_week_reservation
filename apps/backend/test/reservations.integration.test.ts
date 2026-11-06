import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../dist/db/migrate.js';

test('business tables enforce reservation periods, ownership references and concurrent availability', async (t) => {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    'postgresql://tech_week:tech_week_test@127.0.0.1:55432/tech_week_test';
  if (!new URL(connectionString).pathname.endsWith('_test'))
    throw new Error('Use a dedicated database ending in _test.');
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2000 });
  const userIds = [randomUUID(), randomUUID()];
  const roomIds = [randomUUID(), randomUUID()];
  t.after(async () => {
    try {
      await pool.query(
        'DELETE FROM public.reservations WHERE room_id = ANY($1::uuid[])',
        [roomIds],
      );
      await pool.query('DELETE FROM public.rooms WHERE id = ANY($1::uuid[])', [
        roomIds,
      ]);
      await pool.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[])', [
        userIds,
      ]);
    } finally {
      await pool.end();
    }
  });
  await migrate(pool);
  await migrate(pool);
  for (const id of userIds) {
    await pool.query(
      `INSERT INTO auth.users (id, email, password_hash, business_name)
       VALUES ($1, $2, $3, $4)`,
      [
        id,
        `${id}@example.test`,
        'not-a-login-credential-'.repeat(8),
        `Empresa ${id}`,
      ],
    );
  }
  for (const [index, id] of roomIds.entries())
    await pool.query(
      'INSERT INTO public.rooms (id, name, capacity) VALUES ($1, $2, $3)',
      [id, `Sala ${index}`, 8],
    );

  async function reserve(
    room: string,
    user: string,
    start: string,
    end: string,
  ) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO public.reservations (room_id, user_id, starts_at, ends_at)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [room, user, start, end],
    );
    return rows[0]!.id;
  }
  const start = '2030-01-07T09:00:00-03:00';
  const end = '2030-01-07T11:00:00-03:00';

  await t.test(
    'invalid rooms, missing references and empty/reversed/infinite periods are rejected',
    async () => {
      await assert.rejects(
        pool.query(
          'INSERT INTO public.rooms (name, capacity) VALUES ($1, $2)',
          ['Sala inválida', 0],
        ),
        { code: '23514' },
      );
      await assert.rejects(reserve(randomUUID(), userIds[0]!, start, end), {
        code: '23503',
      });
      await assert.rejects(reserve(roomIds[0]!, randomUUID(), start, end), {
        code: '23503',
      });
      for (const [from, to] of [
        [start, start],
        [end, start],
        ['-infinity', end],
        [start, 'infinity'],
      ])
        await assert.rejects(reserve(roomIds[0]!, userIds[0]!, from!, to!));
      assert.equal(
        (
          await pool.query(
            'SELECT count(*) FROM public.reservations WHERE room_id = ANY($1::uuid[])',
            [roomIds],
          )
        ).rows[0].count,
        '0',
      );
    },
  );

  const first = await reserve(roomIds[0]!, userIds[0]!, start, end);
  await t.test(
    'overlaps are blocked across clients and time zones; adjacent periods and other rooms are allowed',
    async () => {
      for (const [from, to] of [
        [start, end],
        ['2030-01-07T10:00:00-03:00', '2030-01-07T12:00:00-03:00'],
        ['2030-01-07T08:00:00-03:00', '2030-01-07T12:00:00-03:00'],
        ['2030-01-07T09:30:00-03:00', '2030-01-07T10:00:00-03:00'],
        ['2030-01-07T12:00:00Z', '2030-01-07T14:00:00Z'],
      ])
        await assert.rejects(reserve(roomIds[0]!, userIds[1]!, from!, to!), {
          code: '23P01',
        });
      await reserve(roomIds[0]!, userIds[1]!, end, '2030-01-07T12:00:00-03:00');
      await reserve(roomIds[1]!, userIds[1]!, start, end);
    },
  );

  await t.test(
    'cancellation retains history and releases the interval, but reactivation cannot overlap',
    async () => {
      await pool.query(
        'UPDATE public.reservations SET cancelled_at = now() WHERE id = $1',
        [first],
      );
      await reserve(roomIds[0]!, userIds[1]!, start, end);
      assert(
        (
          await pool.query(
            'SELECT cancelled_at FROM public.reservations WHERE id = $1',
            [first],
          )
        ).rows[0].cancelled_at,
      );
      await assert.rejects(
        pool.query(
          'UPDATE public.reservations SET cancelled_at = NULL WHERE id = $1',
          [first],
        ),
        { code: '23P01' },
      );
      await assert.rejects(
        pool.query('DELETE FROM public.rooms WHERE id = $1', [roomIds[0]]),
        { code: '23001' },
      );
      await assert.rejects(
        pool.query('DELETE FROM auth.users WHERE id = $1', [userIds[0]]),
        { code: '23001' },
      );
    },
  );

  await t.test(
    'two simultaneous inserts for the same room and period have exactly one winner',
    async () => {
      const results = await Promise.allSettled(
        userIds.map((user) =>
          reserve(
            roomIds[0]!,
            user,
            '2030-01-08T09:00:00Z',
            '2030-01-08T10:00:00Z',
          ),
        ),
      );
      assert.equal(
        results.filter((result) => result.status === 'fulfilled').length,
        1,
      );
      const rejected = results.find((result) => result.status === 'rejected');
      assert(rejected?.status === 'rejected');
      // Concurrent GiST inserts can abort a contender for exclusion or deadlock.
      // Both must preserve the invariant: exactly one persisted reservation.
      assert(['23P01', '40P01'].includes(rejected.reason.code));
      assert.equal(
        (
          await pool.query(
            "SELECT count(*) FROM public.reservations WHERE room_id = $1 AND starts_at = '2030-01-08T09:00:00Z'",
            [roomIds[0]],
          )
        ).rows[0].count,
        '1',
      );
    },
  );

  await t.test(
    'the admin agenda joins rooms and client names in one query, with ownership filtering available',
    async () => {
      const { rows } = await pool.query(
        `SELECT r.id, r.user_id, room.name AS room_name, u.business_name
       FROM public.reservations r
       JOIN public.rooms room ON room.id = r.room_id
       JOIN auth.users u ON u.id = r.user_id
       WHERE r.room_id = ANY($1::uuid[]) AND r.cancelled_at IS NULL
         AND r.starts_at < $3::timestamptz AND r.ends_at > $2::timestamptz
       ORDER BY r.starts_at, r.id LIMIT 50`,
        [roomIds, '2030-01-07T00:00:00Z', '2030-01-09T00:00:00Z'],
      );
      assert.equal(rows.length, 4);
      for (const row of rows) {
        assert(row.room_name.startsWith('Sala '));
        assert.equal(row.business_name, `Empresa ${row.user_id}`);
      }
      const mine = await pool.query(
        'SELECT id, user_id FROM public.reservations WHERE user_id = $1',
        [userIds[0]],
      );
      assert(mine.rows.length > 0);
      assert(mine.rows.every((row) => row.user_id === userIds[0]));
    },
  );
});
