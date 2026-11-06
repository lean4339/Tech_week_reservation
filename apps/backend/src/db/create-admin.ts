import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import pg from 'pg';
import { migrate } from './migrate.js';
import { hashPassword } from '../auth/password.js';
import { readAdminPassword } from './admin-password.js';
import { postgresUsers } from '../auth/stores.js';
import { emailPattern } from '../auth/schemas.js';

if (!process.stdin.isTTY)
  throw new Error(
    'Use an interactive terminal. Never pass passwords as command arguments.',
  );
let hidden = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!hidden) process.stdout.write(chunk);
    callback();
  },
});
const prompt = createInterface({
  input: process.stdin,
  output,
  terminal: true,
});
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://tech_week:tech_week_local@127.0.0.1:5432/tech_week',
  connectionTimeoutMillis: 5000,
});
try {
  const email = (await prompt.question('Admin email: ')).trim().toLowerCase();
  if (email.length > 254 || !new RegExp(emailPattern).test(email))
    throw new Error('Invalid email.');
  hidden = true;
  const password = await readAdminPassword({
    readHidden: async (label) => {
      process.stdout.write(label);
      const value = await prompt.question('');
      process.stdout.write('\n');
      return value;
    },
    write: (message) => {
      process.stdout.write(message);
    },
  });
  await migrate(pool);
  const user = await postgresUsers(pool).create(
    email,
    await hashPassword(password),
    'admin',
  );
  if (!user)
    throw new Error(
      'Account already exists; no account was promoted or changed.',
    );
  console.log(`Admin created: ${user.id}`);
} catch (error) {
  const allowed = [
    'Invalid email.',
    'Account already exists; no account was promoted or changed.',
  ];
  console.error(
    error instanceof Error && allowed.includes(error.message)
      ? error.message
      : 'Could not create admin. Check database availability and migrations.',
  );
  process.exitCode = 1;
} finally {
  prompt.close();
  await pool.end();
}
