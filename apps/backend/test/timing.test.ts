import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { hashPassword } from '../dist/auth/password.js';
import { setup, password, headers } from './helpers.ts';

test('timing diagnostic: unknown, inactive and wrong-password login paths all pay the hashing cost', async (t) => {
  const { app, users, security } = setup(t);
  const hash = await hashPassword(password);
  await users.create('known@example.test', hash, 'user');
  const inactive = await users.create('inactive@example.test', hash, 'user');
  assert(inactive);
  inactive.active = false;
  // Measure cryptographic paths independently of the separately tested throttle.
  security.consume = async () => true;
  const cases = [
    { name: 'unknown', email: 'unknown@example.test', password },
    {
      name: 'wrong-first-character',
      email: 'known@example.test',
      password: 'Z' + password.slice(1),
    },
    {
      name: 'wrong-last-character',
      email: 'known@example.test',
      password: password.slice(0, -1) + 'Z',
    },
    { name: 'inactive', email: 'inactive@example.test', password },
  ];
  const measurements = new Map(cases.map((c) => [c.name, [] as number[]]));
  // Interleave case order to reduce warmup and background-load bias.
  for (let round = 0; round < 8; round++) {
    for (let offset = 0; offset < cases.length; offset++) {
      const item = cases[(round + offset) % cases.length]!;
      const start = performance.now();
      const result = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers,
        payload: { email: item.email, password: item.password },
      });
      const elapsed = performance.now() - start;
      assert.equal(result.statusCode, 401);
      assert.deepEqual(result.json(), {
        message: 'Email o contraseña incorrectos.',
      });
      if (round > 0) measurements.get(item.name)!.push(elapsed);
    }
  }
  const medians = [...measurements.entries()].map(([name, samples]) => {
    samples.sort((a, b) => a - b);
    return { name, medianMs: samples[Math.floor(samples.length / 2)]! };
  });
  const values = medians.map((m) => m.medianMs);
  const ratio = Math.max(...values) / Math.min(...values);
  t.diagnostic(
    JSON.stringify({
      medians,
      maxToMinRatio: ratio,
      samplesPerCase: 7,
      scope: 'in-process HTTP, in-memory storage, real scrypt',
    }),
  );
  // A smoke-test threshold, NOT a proof of constant-time behavior or absence of side channels.
  assert(
    ratio < 2,
    'Large timing discrepancy; inspect the diagnostic and repeat under controlled load.',
  );
  assert.equal(security.sessions.size, 0);
});
