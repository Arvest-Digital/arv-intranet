import { ApiErrorBody } from '@arv/contracts/shared';
import { Option, Schema } from 'effect';

/**
 * Base URL and fetch for typed clients (`hc<Routes>(API_BASE_URL, { fetch: bindingFetch(api, token) })`)
 * over the `API` service binding. The host is ignored by the binding; only the path matters.
 */
export const API_BASE_URL = 'https://api.internal';

/**
 * Calls the api over the binding, forwarding the session token as `Authorization: Bearer`
 * (ADR-0007). Without a token the request goes anonymous and the api answers 401 where it must.
 */
export const bindingFetch =
  (api: Fetcher, sessionToken?: string | null) =>
  (input: RequestInfo | URL, init?: RequestInit) => {
    if (!sessionToken) return api.fetch(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
    headers.set('Authorization', `Bearer ${sessionToken}`);
    return api.fetch(input, { ...init, headers });
  };

/**
 * What a gateway call returns: a decoded value, or an error ready for the UI. `code` and `details`
 * come from the api's error body when it has one (e.g. `identity.access_removed`).
 */
export type ApiResult<A> = { readonly ok: true; readonly value: A } | ApiFailure;

export type ApiFailure = {
  readonly ok: false;
  readonly status: number;
  readonly message: string;
  readonly code?: string;
  readonly details?: Readonly<Record<string, unknown>>;
};

const decodeError = Schema.decodeUnknownOption(ApiErrorBody);

/** Turns a non-2xx response into a failed `ApiResult`, using the API's message when it has one. */
export async function failure(
  res: { readonly status: number; json(): Promise<unknown> },
  fallback: string,
): Promise<ApiFailure> {
  const body: unknown = await res.json().catch(() => null);
  return Option.match(decodeError(body), {
    onNone: () => ({ ok: false, status: res.status, message: fallback }),
    onSome: ({ error }) => ({
      ok: false,
      status: res.status,
      message: error.message,
      code: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
    }),
  });
}
