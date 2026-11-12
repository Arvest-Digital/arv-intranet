import { redirect } from 'react-router';
import { foreignOriginResponse, isAllowedOrigin } from '~/shared/lib/origin-check.server';
import { destroySession, getSessionToken } from '~/shared/lib/session.server';
import { identityGateway } from '../identity.server';
import type { Route } from './+types/sign-out';

/** Sign-out changes state, so GET only goes back to the sign-in page. */
export function loader() {
  return redirect('/sign-in');
}

/**
 * Ends the session in the api, clears the cookie and shows the sign-in page (AC-20). Google's own
 * session is left alone; the sign-in page never redirects to Google by itself, so this holds.
 */
export async function action({ request, context }: Route.ActionArgs) {
  if (!isAllowedOrigin(request)) throw foreignOriginResponse();
  const token = await getSessionToken(request);
  // A failed api call still clears the cookie: the user asked to leave, and the session expires.
  if (token) await identityGateway(context.cloudflare.env.API, token).signOut();
  return redirect('/sign-in?signedOut', {
    headers: { 'Set-Cookie': await destroySession() },
  });
}
