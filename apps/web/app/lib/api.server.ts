import type { AppType } from '@arv/api';
import { hc } from 'hono/client';

/**
 * Typed client for apps/api over the `API` service binding.
 * The host is ignored by the binding; only the path matters.
 */
export const createApiClient = (api: Fetcher) =>
  hc<AppType>('https://api.internal', {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => api.fetch(input, init),
  });

export type ApiClient = ReturnType<typeof createApiClient>;
