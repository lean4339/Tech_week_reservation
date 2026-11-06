import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  validPassword,
} from '../dist/auth/password.js';
import { authConfig } from '../dist/auth/config.js';
import { password } from './helpers.ts';
import { publicUser } from '../dist/auth/model.js';
import { sessionKey } from '../dist/auth/stores.js';
import { createAuthService } from '../dist/auth/service.js';
import { InvalidPasswordError } from '../dist/auth/password.js';
import { MemoryUsers, MemorySecurity } from './helpers.ts';

test('auth service enforces the password policy even without an HTTP controller', async () => {
  const users = new MemoryUsers();
  const security = new MemorySecurity();
  const service = createAuthService(users, security);
  await assert.rejects(
    service.signup(
      { email: 'weak@example.test', password: 'short' },
      {
        requestId: 'service-test',
        ip: '127.0.0.1',
      },
    ),
    InvalidPasswordError,
  );
  assert.equal(await users.count(), 0);
  assert.equal(security.records.length, 0);
});

test('public user projection exposes only the required identity and permissions', () => {
  const result = publicUser({
    id: 'test-id',
    email: 'a@example.test',
    password_hash: 'never-expose-this',
    role: 'user',
    active: true,
  });
  assert.deepEqual(result, {
    id: 'test-id',
    email: 'a@example.test',
    role: 'user',
    permissions: ['profile:read'],
  });
  assert(!JSON.stringify(result).includes('never-expose-this'));
});

test('Redis session keys contain digests instead of bearer tokens', () => {
  const token = 'a'.repeat(43);
  assert.match(sessionKey(token), /^tech-week:session:[a-f0-9]{64}$/);
  assert(!sessionKey(token).includes(token));
  assert.notEqual(sessionKey(token), sessionKey('b'.repeat(43)));
});

test('corrupted password encodings are rejected instead of downgrading hashing', async () => {
  for (const hash of [
    'plaintext',
    'scrypt$1$8$1$00$00',
    'scrypt$131072$8$1$bad$bad',
  ]) {
    await assert.rejects(
      verifyPassword(password, hash),
      /Invalid stored password encoding/,
    );
  }
});

test('passwords use different salts, verify correctly and reject wrong passwords', async () => {
  const one = await hashPassword(password);
  const two = await hashPassword(password);
  assert.notEqual(one, two);
  assert(!one.includes(password));
  assert(await verifyPassword(password, one));
  assert(!(await verifyPassword('wrong password', one)));
  assert(validPassword('palabras con espacios y símbolos ✓'));
  assert(!validPassword('123456789012345'));
  assert(!validPassword('short'));
  assert(!validPassword('a'.repeat(129)));
});

test('production requires exact HTTPS origins and selects a Secure host-only cookie', () => {
  const previous = {
    node: process.env.NODE_ENV,
    origins: process.env.APP_ORIGINS,
  };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.APP_ORIGINS;
    assert.throws(() => authConfig());
    process.env.APP_ORIGINS = 'http://localhost:3000';
    assert.throws(() => authConfig());
    process.env.APP_ORIGINS = 'https://example.com/path';
    assert.throws(() => authConfig());
    process.env.APP_ORIGINS = 'https://example.com';
    assert.equal(authConfig().secureCookies, true);
    assert.equal(authConfig().cookieName, '__Host-tech_week_session');
  } finally {
    if (previous.node === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.node;
    if (previous.origins === undefined) delete process.env.APP_ORIGINS;
    else process.env.APP_ORIGINS = previous.origins;
  }
});
