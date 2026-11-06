import type { FastifyInstance } from 'fastify';
import type { SecurityStore } from '../auth/model.js';

export function registerRequestAudit(
  app: FastifyInstance,
  getSecurity: () => SecurityStore | undefined,
) {
  app.addHook('onResponse', async (request, reply) => {
    const requestAudit = getSecurity();
    if (!requestAudit) return;
    const record = {
      requestId: request.id,
      time: new Date().toISOString(),
      ip: request.ip,
      ipSource: 'socket' as const,
      method: request.method,
      route: request.routeOptions.url ?? '/unmatched',
      status: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime * 1000) / 1000,
    };
    try {
      await requestAudit.logRequest(record);
    } catch {
      // Response has already been sent. Preserve metadata locally, never the body or query.
      app.log.error(
        { event: 'request_audit_failed', request: record },
        'Redis request audit unavailable',
      );
    }
  });
}
