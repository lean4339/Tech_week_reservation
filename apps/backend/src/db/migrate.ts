import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

export async function migrate(pool: Pool) {
  const directory = new URL('../../migrations/', import.meta.url);
  const files = (await readdir(directory))
    .filter((f) => /^\d+_[a-z_]+\.sql$/.test(f))
    .sort();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(73642109)');
    await client.query('CREATE SCHEMA IF NOT EXISTS auth');
    await client.query(`CREATE TABLE IF NOT EXISTS auth.schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const name of files) {
      const sql = await readFile(new URL(name, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await client.query<{ checksum: string }>(
        'SELECT checksum FROM auth.schema_migrations WHERE name = $1',
        [name],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].checksum !== checksum)
          throw new Error(`Migration modified: ${name}`);
        continue;
      }
      await client.query(sql);
      await client.query(
        'INSERT INTO auth.schema_migrations (name, checksum) VALUES ($1, $2)',
        [name, checksum],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
