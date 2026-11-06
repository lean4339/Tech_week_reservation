import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import {
  ABSOLUTE_MS,
  IDLE_MS,
  type AuditRecord,
  type RequestRecord,
  type Role,
  type SecurityStore,
  type Session,
  type User,
  type UserStore,
} from './model.js';

export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const sessionKey = (token: string) =>
  `tech-week:session:${digest(token)}`;
const auditExpiry = (time: string) =>
  Math.floor(Date.parse(`${time.slice(0, 10)}T00:00:00Z`) / 1000) + 7 * 86400;

export function postgresUsers(pool: Pool): UserStore {
  return {
    async findByEmail(email) {
      return (
        (
          await pool.query<User>(
            'SELECT id, email, business_name, password_hash, role, active FROM auth.users WHERE email = $1',
            [email],
          )
        ).rows[0] ?? null
      );
    },
    async findById(id) {
      return (
        (
          await pool.query<User>(
            'SELECT id, email, business_name, password_hash, role, active FROM auth.users WHERE id = $1',
            [id],
          )
        ).rows[0] ?? null
      );
    },
    async create(
      email: string,
      hash: string,
      role: Role,
      businessName: string | null = null,
    ) {
      return (
        (
          await pool.query<User>(
            `INSERT INTO auth.users (id, email, password_hash, role, business_name)
        VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING
        RETURNING id, email, business_name, password_hash, role, active`,
            [randomUUID(), email, hash, role, businessName],
          )
        ).rows[0] ?? null
      );
    },
    async count() {
      return Number(
        (await pool.query<{ count: string }>('SELECT count(*) FROM auth.users'))
          .rows[0]!.count,
      );
    },
  };
}

export function redisSecurity(redis: FastifyInstance['redis']): SecurityStore {
  return {
    async readSession(token) {
      // Atomic read + idle renewal: logout cannot resurrect a session in a racing request.
      const result = await redis.eval(
        `
        local raw = redis.call('GET', KEYS[1])
        if not raw then return nil end
        local s = cjson.decode(raw)
        local now = tonumber(ARGV[1])
        local remaining = s.createdAt + tonumber(ARGV[2]) - now
        if remaining <= 0 or now - s.lastSeenAt >= tonumber(ARGV[3]) then
          redis.call('DEL', KEYS[1]); return nil
        end
        s.lastSeenAt = now
        redis.call('SET', KEYS[1], cjson.encode(s), 'PX', math.min(remaining, tonumber(ARGV[3])))
        return cjson.encode(s)
      `,
        1,
        sessionKey(token),
        Date.now(),
        ABSOLUTE_MS,
        IDLE_MS,
      );
      return typeof result === 'string'
        ? (JSON.parse(result) as Session)
        : null;
    },
    async createSession(token, session, previous) {
      const transaction = redis.multi();
      if (previous) transaction.del(sessionKey(previous));
      transaction.set(
        sessionKey(token),
        JSON.stringify(session),
        'PX',
        IDLE_MS,
      );
      const result = await transaction.exec();
      if (!result || result.some(([error]) => error))
        throw new Error('Session write failed');
    },
    async deleteSession(token) {
      await redis.del(sessionKey(token));
    },
    async consume(key, limit, seconds) {
      const count = await redis.eval(
        `
        local n = redis.call('INCR', KEYS[1])
        if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
        return n
      `,
        1,
        `tech-week:rate:${digest(key)}`,
        seconds,
      );
      return Number(count) <= limit;
    },
    async audit(record) {
      const key = `tech-week:audit:${record.time.slice(0, 10)}`;
      const result = await redis
        .multi()
        .xadd(key, 'MAXLEN', '=', 10000, '*', 'record', JSON.stringify(record))
        .expireat(key, auditExpiry(record.time))
        .exec();
      if (!result || result.some(([error]) => error))
        throw new Error('Audit write failed');
    },
    async events() {
      const records: AuditRecord[] = [];
      for (let days = 0; days < 7 && records.length < 50; days++) {
        const date = new Date(Date.now() - days * 86400000)
          .toISOString()
          .slice(0, 10);
        const entries = await redis.xrevrange(
          `tech-week:audit:${date}`,
          '+',
          '-',
          'COUNT',
          50 - records.length,
        );
        for (const [, fields] of entries)
          if (fields[1]) records.push(JSON.parse(fields[1]) as AuditRecord);
      }
      return records;
    },
    async logRequest(record) {
      const key = `tech-week:requests:${record.time.slice(0, 10)}`;
      const result = await redis
        .multi()
        .xadd(key, 'MAXLEN', '=', 100000, '*', 'record', JSON.stringify(record))
        .expireat(key, auditExpiry(record.time))
        .exec();
      if (!result || result.some(([error]) => error))
        throw new Error('Request audit write failed');
    },
    async requests() {
      const records: RequestRecord[] = [];
      for (let days = 0; days < 7 && records.length < 50; days++) {
        const date = new Date(Date.now() - days * 86400000)
          .toISOString()
          .slice(0, 10);
        const entries = await redis.xrevrange(
          `tech-week:requests:${date}`,
          '+',
          '-',
          'COUNT',
          50 - records.length,
        );
        for (const [, fields] of entries)
          if (fields[1]) records.push(JSON.parse(fields[1]) as RequestRecord);
      }
      return records;
    },
  };
}
