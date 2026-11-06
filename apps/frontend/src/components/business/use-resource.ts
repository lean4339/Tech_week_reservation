'use client';
import { useEffect, useState } from 'react';
import { errorMessage } from '@/lib/business';

import { useBusinessRequest } from './use-business-request';

export function useResource<T>(path: string | null) {
  const businessRequest = useBusinessRequest();
  const [version, setVersion] = useState(0);
  const key = `${path}:${version}`;
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: string;
  }>();
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    businessRequest<T>(path, { signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setResult({ key, error: errorMessage(error) });
      },
    );
    return () => controller.abort();
  }, [path, key, businessRequest]);
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    loading: path !== null && result?.key !== key,
    reload: () => setVersion((value) => value + 1),
  };
}
