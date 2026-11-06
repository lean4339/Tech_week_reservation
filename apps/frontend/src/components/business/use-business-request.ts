'use client';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { businessRequest, SessionExpiredError } from '@/lib/business';

export function useBusinessRequest() {
  const router = useRouter();
  return useCallback(
    async <T>(...args: Parameters<typeof businessRequest>): Promise<T> => {
      try {
        return await businessRequest<T>(...args);
      } catch (error) {
        if (error instanceof SessionExpiredError) {
          router.replace('/login');
          router.refresh();
        }
        throw error;
      }
    },
    [router],
  );
}
