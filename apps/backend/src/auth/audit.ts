import type { AuditEvent, SecurityStore } from './model.js';

export interface AuditContext {
  requestId: string;
  ip: string;
}

export function writeAuthEvent(
  security: SecurityStore,
  event: AuditEvent,
  context: AuditContext,
  userId?: string,
) {
  return security.audit({
    event,
    requestId: context.requestId,
    ip: context.ip,
    ...(userId ? { userId } : {}),
    time: new Date().toISOString(),
  });
}
