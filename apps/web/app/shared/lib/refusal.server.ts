import { IdentityErrorCodes } from '@arv/contracts/identity';
import { data, redirect } from 'react-router';
import type { ApiFailure } from './api.server';
import { ACCESS_REMOVED, missingPermission } from './refusal';
import { destroySession } from './session.server';

/**
 * For feature loaders and actions: turns a refused api call into the same answer the root gate
 * gives, and a 403 into «you lack the permission» (AC-08), naming `permission` when given. Returns
 * null for other failures, which the caller handles itself.
 */
export async function refusalResponse(failed: ApiFailure, request: Request, permission?: string) {
  if (failed.status === 401 || failed.status === 403) {
    return refuse(failed, new URL(request.url), permission);
  }
  return null;
}

/**
 * - a session the api no longer accepts → the sign-in page with `returnTo` (AC-01, AC-20);
 * - removed from the access list → clear the cookie, «you no longer have access» (AC-07);
 * - 403 → «you lack the permission» (AC-08);
 * - anything else → an error page with no data (fail closed).
 */
export async function refuse(failed: ApiFailure, url: URL, permission?: string) {
  if (failed.status === 401) {
    const clearCookie = { 'Set-Cookie': await destroySession() };
    return failed.code === IdentityErrorCodes.accessRemoved
      ? data(ACCESS_REMOVED, { status: 401, headers: clearCookie })
      : signInRedirect(url, clearCookie);
  }
  if (failed.status === 403) return data(missingPermission(permission), { status: 403 });
  return data('Something went wrong', { status: 502 });
}

export function signInRedirect(url: URL, headers?: HeadersInit) {
  const query = new URLSearchParams({ returnTo: url.pathname + url.search });
  return redirect(`/sign-in?${query}`, { headers });
}
