import pg from 'pg';
import { migrate } from './migrate.js';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://tech_week:tech_week_local@127.0.0.1:5432/tech_week',
  connectionTimeoutMillis: 5000,
});
try {
  await migrate(pool);
  console.log('Migrations applied.');
} catch {
  console.error(
    'Migration failed. Check database availability and migration checksums.',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
