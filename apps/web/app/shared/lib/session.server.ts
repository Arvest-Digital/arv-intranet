import { Session, SignInRedirect } from '@arv/contracts/identity';
import { Option, Schema } from 'effect';
import { type CookieOptions, createCookie } from 'react-router';
import { safeReturnTo } from './return-to';

/**
 * `__Host-` cookies are Secure, `Path=/` and carry no Domain, so no other subdomain can set them.
 * Secure even in development: browsers treat http://localhost as a secure origin.
 */
const HOST_COOKIE: CookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };

// ---- Session (ADR-0002, sad §8 Authentication) ----

const sessionCookie = createCookie('__Host-arv_session', HOST_COOKIE);

const decodeToken = Schema.decodeUnknownOption(Session.fields.sessionToken);

/** The session token from the request's cookie, or null when absent or malformed. */
export async function getSessionToken(request: Request): Promise<string | null> {
  const value: unknown = await sessionCookie.parse(request.headers.get('Cookie'));
  return Option.getOrNull(decodeToken(value));
}

/** `Set-Cookie` for a new session; the cookie expires with the session (AC-20). */
export function commitSession(session: Session): Promise<string> {
  return sessionCookie.serialize(session.sessionToken, { expires: session.expiresAt });
}

/** `Set-Cookie` that clears the session cookie (sign-out, ended session). */
export function destroySession(): Promise<string> {
  return sessionCookie.serialize('', { expires: new Date(0), maxAge: 0 });
}

// ---- Sign-in state (sad §6 Critical flow 1) ----

/** Lifetime of one sign-in round-trip through Google. */
export const SIGN_IN_STATE_MAX_AGE_SECONDS = 10 * 60;

/** What web keeps between beginning sign-in and Google's return. */
export const SignInState = Schema.Struct({
  state: SignInRedirect.fields.state,
  codeVerifier: SignInRedirect.fields.codeVerifier,
  returnTo: Schema.String,
});
export type SignInState = typeof SignInState.Type;

const signInStateCookie = createCookie('__Host-arv_sign_in', {
  ...HOST_COOKIE,
  maxAge: SIGN_IN_STATE_MAX_AGE_SECONDS,
});

const decodeSignInState = Schema.decodeUnknownOption(SignInState);

/** The pending sign-in, or null when absent, expired or malformed. `returnTo` is always safe. */
export async function getSignInState(request: Request): Promise<SignInState | null> {
  const value: unknown = await signInStateCookie.parse(request.headers.get('Cookie'));
  return decodeSignInState(value).pipe(
    Option.map((pending) => ({ ...pending, returnTo: safeReturnTo(pending.returnTo) })),
    Option.getOrNull,
  );
}

/** `Set-Cookie` holding the state, PKCE verifier and (made safe) `returnTo` for 10 minutes. */
export function commitSignInState(pending: SignInState): Promise<string> {
  return signInStateCookie.serialize({ ...pending, returnTo: safeReturnTo(pending.returnTo) });
}

/** `Set-Cookie` that clears the sign-in state once Google has returned. */
export function destroySignInState(): Promise<string> {
  return signInStateCookie.serialize('', { expires: new Date(0), maxAge: 0 });
}
