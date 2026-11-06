import { test as base } from '@playwright/test';
import { Redis } from 'ioredis';

// Each scenario starts with fresh rate counters, just as it has fresh browser
// cookies. Only the fixed, isolated test Redis is touched; real limiter code and
// thresholds remain enabled throughout every scenario. Tests run with one worker.
export const test = base.extend<{ isolatedRateCounters: void }>({
  isolatedRateCounters: [
    async ({}, use) => {
      const redis = new Redis('redis://127.0.0.1:56379/15', {
        lazyConnect: true,
        connectTimeout: 2000,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
      });
      redis.on('error', () => {});
      try {
        await redis.connect();
        let cursor = '0';
        do {
          const result = await redis.scan(
            cursor,
            'MATCH',
            'tech-week:rate:*',
            'COUNT',
            100,
          );
          cursor = result[0];
          if (result[1].length) await redis.del(...result[1]);
        } while (cursor !== '0');
        await use();
      } finally {
        redis.disconnect();
      }
    },
    { auto: true },
  ],
});
export { expect } from '@playwright/test';
