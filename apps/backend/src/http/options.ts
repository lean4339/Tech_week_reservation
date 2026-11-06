import type { FastifyServerOptions } from 'fastify';
import { randomUUID } from 'node:crypto';

export function serverOptions(logger = true): FastifyServerOptions {
  return {
    trustProxy: false,
    bodyLimit: 4096,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: false,
        useDefaults: false,
      },
    },
    logger:
      logger === false
        ? false
        : {
            level: process.env.LOG_LEVEL ?? 'info',
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
            ],
            serializers: {
              req: (req) => ({
                method: req.method,
                route: req.routeOptions?.url ?? '/unmatched',
              }),
            },
          },
  };
}
