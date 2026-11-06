import type { Pool, PoolClient } from 'pg';
import { BusinessError } from '../modules/shared/errors.js';
export async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Bound lock/resource contention; no endless waits under concurrent writes.
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    const code = (error as { code?: string }).code;
    if (code === '23P01')
      throw new BusinessError(409, 'La sala ya está reservada en ese período.');
    if (code === '40P01' || code === '55P03')
      throw new BusinessError(
        409,
        'La sala está siendo modificada. Volvé a intentar.',
      );
    throw error;
  } finally {
    client.release();
  }
}
