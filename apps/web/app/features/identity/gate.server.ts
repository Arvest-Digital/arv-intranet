import type { Me } from '@arv/contracts/identity';
import { refuse, signInRedirect } from '~/shared/lib/refusal.server';
import { getSessionToken } from '~/shared/lib/session.server';
import { identityGateway } from './identity.server';

/** Feature loaders use it from `~/shared/lib/refusal.server`; re-exported for identity's own. */
export { refusalResponse } from '~/shared/lib/refusal.server';

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
