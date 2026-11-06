export type Role = 'admin' | 'user';
export type Permission = 'profile:read' | 'admin:read' | 'audit:read';
export const permissions: Record<Role, readonly Permission[]> = {
  user: ['profile:read'],
  admin: ['profile:read', 'admin:read', 'audit:read'],
};
export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  active: boolean;
}
export interface Session {
  userId: string;
  createdAt: number;
  lastSeenAt: number;
}
export type AuditEvent =
  | 'signup_created'
  | 'signup_duplicate'
  | 'login_succeeded'
  | 'login_failed'
  | 'logout'
  | 'access_denied'
  | 'rate_limited';
export interface AuditRecord {
  event: AuditEvent;
  requestId: string;
  userId?: string;
  time: string;
  ip: string;
}
export interface RequestRecord {
  requestId: string;
  time: string;
  ip: string;
  ipSource: 'socket';
  method: string;
  route: string;
  status: number;
  durationMs: number;
}
export interface UserStore {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(email: string, hash: string, role: Role): Promise<User | null>;
  count(): Promise<number>;
}
export interface SecurityStore {
  readSession(token: string): Promise<Session | null>;
  createSession(
    token: string,
    session: Session,
    previous?: string,
  ): Promise<void>;
  deleteSession(token: string): Promise<void>;
  consume(key: string, limit: number, seconds: number): Promise<boolean>;
  audit(record: AuditRecord): Promise<void>;
  events(): Promise<AuditRecord[]>;
  logRequest(record: RequestRecord): Promise<void>;
  requests(): Promise<RequestRecord[]>;
}
export const IDLE_MS = 30 * 60 * 1000;
export const ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    permissions: permissions[user.role] ?? [],
  };
}
