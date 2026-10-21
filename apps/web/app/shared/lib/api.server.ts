import { ApiErrorBody } from '@arv/contracts/shared';
import { Option, Schema } from 'effect';

/**
 * Base URL and fetch for typed clients (`hc<Routes>(API_BASE_URL, { fetch: bindingFetch(api) })`)
 * over the `API` service binding. The host is ignored by the binding; only the path matters.
 */
export const API_BASE_URL = 'https://api.internal';

export const bindingFetch = (api: Fetcher) => (input: RequestInfo | URL, init?: RequestInit) =>
  api.fetch(input, init);

/** What a gateway call returns: a decoded value, or an error message ready for the UI. */
export type ApiResult<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly status: number; readonly message: string };

const decodeError = Schema.decodeUnknownOption(ApiErrorBody);

/** Turns a non-2xx response into a failed `ApiResult`, using the API's message when it has one. */
export async function failure(
  res: { readonly status: number; json(): Promise<unknown> },
  fallback: string,
): Promise<ApiResult<never>> {
  const body: unknown = await res.json().catch(() => null);
  const message = decodeError(body).pipe(
    Option.map((decoded) => decoded.error.message),
    Option.getOrElse(() => fallback),
  );
  return { ok: false, status: res.status, message };
}
