import { IdentityErrorCodes, type Me } from '@arv/contracts/identity';
import { data, redirect } from 'react-router';
import type { ApiFailure } from '~/shared/lib/api.server';
import { destroySession, getSessionToken } from '~/shared/lib/session.server';
import { ACCESS_REMOVED, MISSING_PERMISSION } from './gate';
import { identityGateway } from './identity.server';

/** The only pages outside the gate (ADR-0002): they must render without a session. */
const PUBLIC_PATHS = new Set(['/sign-in', '/sign-in/return', '/sign-out']);

const isPublicPath = (pathname: string) =>
  PUBLIC_PATHS.has(pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);

/**
 * The root gate (ADR-0002, sad §6 Critical flow 2). Public pages pass with `null`; every other
 * page needs a session the api still accepts, and gets who is signed in and what they may do.
 * Refusals are thrown, so the root's answer wins over any feature loader running alongside it:
 * - no cookie, or a session the api no longer accepts → the sign-in page with `returnTo`, never
 *   straight to Google (AC-01, AC-20);
 * - removed from the access list → clear the cookie, «you no longer have access» (AC-07);
 * - anything else → an error page with no data (fail closed).
 * The api still refuses on its own; this keeps page shells from rendering anonymously.
 */
export async function gate(request: Request, api: Fetcher): Promise<Me | null> {
  const url = new URL(request.url);
  if (isPublicPath(url.pathname)) return null;

  const token = await getSessionToken(request);
  if (!token) throw signInRedirect(url);

  const me = await identityGateway(api, token).getMe();
  if (me.ok) return me.value;
  throw await refuse(me, url);
}

/**
 * For feature loaders and actions: turns a refused api call into the same answer the gate gives,
 * and a 403 into «you lack the permission» (AC-08). Returns null for other failures, which the
 * caller handles itself.
 */
export async function refusalResponse(failed: ApiFailure, request: Request) {
  if (failed.status === 401 || failed.status === 403) return refuse(failed, new URL(request.url));
  return null;
}

async function refuse(failed: ApiFailure, url: URL) {
  if (failed.status === 401) {
    const clearCookie = { 'Set-Cookie': await destroySession() };
    return failed.code === IdentityErrorCodes.accessRemoved
      ? data(ACCESS_REMOVED, { status: 401, headers: clearCookie })
      : signInRedirect(url, clearCookie);
  }
  if (failed.status === 403) return data(MISSING_PERMISSION, { status: 403 });
  return data('Something went wrong', { status: 502 });
}

function signInRedirect(url: URL, headers?: HeadersInit) {
  const query = new URLSearchParams({ returnTo: url.pathname + url.search });
  return redirect(`/sign-in?${query}`, { headers });
}
