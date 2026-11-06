import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { migrate } from '../dist/db/migrate.js';

test('migration 004 upgrades an existing 003 database without deleting or inventing building assignments', async () => {
  const baseUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://tech_week:tech_week_test@127.0.0.1:55432/tech_week_test';
  if (!new URL(baseUrl).pathname.endsWith('_test'))
    throw new Error('Dedicated test database required.');
  const admin = new pg.Pool({ connectionString: baseUrl });
  // Generated identifier, never user-controlled. Only this disposable database is dropped.
  const name = `building_migration_${randomBytes(6).toString('hex')}_test`;
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  let pool: pg.Pool | undefined;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    pool = new pg.Pool({ connectionString: url.toString() });
    await pool.query(
      'CREATE SCHEMA auth; CREATE TABLE auth.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    // Recreate exactly the old deployed schema, then use the actual migration runner.
    for (const file of [
      '001_auth.sql',
      '002_user_business_name.sql',
      '003_rooms_reservations.sql',
    ]) {
      const sql = await readFile(
        new URL(`../migrations/${file}`, import.meta.url),
        'utf8',
      );
      await pool.query(sql);
      await pool.query(
        'INSERT INTO auth.schema_migrations (name, checksum) VALUES ($1,$2)',
        [file, createHash('sha256').update(sql).digest('hex')],
      );
    }
    const userId = randomUUID(),
      roomId = randomUUID();
    await pool.query(
      'INSERT INTO auth.users (id,email,password_hash) VALUES ($1,$2,$3)',
      [userId, `${userId}@example.test`, 'synthetic-non-login-hash'.repeat(8)],
    );
    await pool.query(
      "INSERT INTO public.rooms (id,name,location,capacity) VALUES ($1,'Sala existente','Piso 4',8)",
      [roomId],
    );
    const reservation = (
      await pool.query(
        "INSERT INTO public.reservations (room_id,user_id,starts_at,ends_at) VALUES ($1,$2,'2035-01-01T12:00:00Z','2035-01-01T13:00:00Z') RETURNING *",
        [roomId, userId],
      )
    ).rows[0];
    await migrate(pool);
    await migrate(pool);
    assert.equal(
      (
        await pool.query(
          "SELECT to_regclass('public.reservations_start_id_idx') IS NOT NULL AS present",
        )
      ).rows[0].present,
      true,
    );
    assert.deepEqual(
      (
        await pool.query('SELECT * FROM public.reservations WHERE id = $1', [
          reservation.id,
        ])
      ).rows[0],
      reservation,
    );
    assert.deepEqual(
      (
        await pool.query(
          'SELECT name, location, capacity, building_id FROM public.rooms WHERE id = $1',
          [roomId],
        )
      ).rows[0],
      {
        name: 'Sala existente',
        location: 'Piso 4',
        capacity: 8,
        building_id: null,
      },
    );
    assert.equal(
      (await pool.query('SELECT count(*) FROM public.buildings')).rows[0].count,
      '0',
    );
    await assert.rejects(
      pool.query('UPDATE public.rooms SET building_id = $1 WHERE id = $2', [
        randomUUID(),
        roomId,
      ]),
      { code: '23503' },
    );
    const buildingId = (
      await pool.query(
        "INSERT INTO public.buildings (name,address) VALUES ('Edificio existente','Calle 123') RETURNING id",
      )
    ).rows[0].id;
    await pool.query('UPDATE public.rooms SET building_id = $1 WHERE id = $2', [
      buildingId,
      roomId,
    ]);
    await assert.rejects(
      pool.query('DELETE FROM public.buildings WHERE id = $1', [buildingId]),
      { code: '23001' },
    );
    await assert.rejects(
      pool.query(
        "INSERT INTO public.buildings (name,address) VALUES (' ','Sin nombre')",
      ),
      { code: '23514' },
    );
  } finally {
    await pool?.end();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
});
