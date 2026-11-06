import type { TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../dist/app.js';
import type {
  AuditRecord,
  Role,
  Session,
  User,
  UserStore,
  SecurityStore,
  RequestRecord,
} from '../src/auth/model.ts';

export const password = 'A long passphrase for local tests!';
export const headers = {
  origin: 'http://localhost:3000',
  'x-requested-with': 'tech-week-web',
};

class MemoryUsers implements UserStore {
  rows = new Map<string, User>();
  async findByEmail(email: string) {
    return [...this.rows.values()].find((u) => u.email === email) ?? null;
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async create(email: string, hash: string, role: Role) {
    if (await this.findByEmail(email)) return null;
    const user = {
      id: randomUUID(),
      email,
      password_hash: hash,
      role,
      active: true,
    };
    this.rows.set(user.id, user);
    return user;
  }
  async count() {
    return this.rows.size;
  }
}
class MemorySecurity implements SecurityStore {
  requestRecords: RequestRecord[] = [];
  sessions = new Map<string, Session>();
  counts = new Map<string, number>();
  records: AuditRecord[] = [];
  async readSession(token: string) {
    return this.sessions.get(token) ?? null;
  }
  async createSession(token: string, session: Session, previous?: string) {
    if (previous) this.sessions.delete(previous);
    this.sessions.set(token, session);
  }
  async deleteSession(token: string) {
    this.sessions.delete(token);
  }
  async consume(key: string, limit: number) {
    const value = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, value);
    return value <= limit;
  }
  async audit(record: AuditRecord) {
    this.records.push(record);
  }
  async events() {
    return this.records;
  }
  async logRequest(record: RequestRecord) {
    this.requestRecords.push(record);
  }
  async requests() {
    return this.requestRecords;
  }
}
export function setup(t: TestContext) {
  const users = new MemoryUsers();
  const security = new MemorySecurity();
  const app = buildApp({ stores: { users, security }, logger: false });
  t.after(() => app.close());
  return { app, users, security };
}
export const cookieFrom = (response: { headers: Record<string, unknown> }) =>
  String(response.headers['set-cookie']).split(';')[0]!;
export const tokenFrom = (cookie: string) => cookie.split('=')[1]!;
