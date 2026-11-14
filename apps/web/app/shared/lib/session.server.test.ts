import { describe, expect, it } from 'vitest';
import {
  commitSession,
  commitSignInState,
  destroySession,
  destroySignInState,
  getSessionToken,
  getSignInState,
  SIGN_IN_STATE_MAX_AGE_SECONDS,
} from './session.server';

const TOKEN = 'a'.repeat(43);
const VERIFIER = 'v'.repeat(43);

/** The `name=value` pair of a `Set-Cookie`, sent back as a request's `Cookie` header. */
const withCookie = (setCookie: string) =>
  new Request('https://intranet.example/', { headers: { Cookie: setCookie.split(';')[0]! } });

/** `Set-Cookie` attributes, lower-cased names, without the `name=value` pair. */
const attributes = (setCookie: string) =>
  new Map(
    setCookie
      .split(';')
      .slice(1)
      .map((part) => {
        const [name, ...value] = part.trim().split('=');
        return [name!.toLowerCase(), value.join('=')] as const;
      }),
  );

describe('session cookie (ADR-0002, sad §8)', () => {
  const expiresAt = new Date('2026-11-18T10:00:00.000Z');

  it('is a host-only, HttpOnly, Secure, SameSite=Lax cookie that expires with the session', async () => {
    const setCookie = await commitSession({ sessionToken: TOKEN, expiresAt });
    const attrs = attributes(setCookie);

    expect(setCookie.startsWith('__Host-arv_session=')).toBe(true);
    expect(attrs.has('httponly')).toBe(true);
    expect(attrs.has('secure')).toBe(true);
    expect(attrs.get('samesite')).toBe('Lax');
    expect(attrs.get('path')).toBe('/');
    expect(attrs.has('domain')).toBe(false);
    expect(new Date(attrs.get('expires')!).getTime()).toBe(expiresAt.getTime());
    expect(attrs.has('max-age')).toBe(false);
  });

  it('reads the token back from the request', async () => {
    const setCookie = await commitSession({ sessionToken: TOKEN, expiresAt });
    expect(await getSessionToken(withCookie(setCookie))).toBe(TOKEN);
  });

  it('reads no token from a request without the cookie', async () => {
    expect(await getSessionToken(new Request('https://intranet.example/'))).toBeNull();
  });

  it('reads no token from a malformed cookie', async () => {
    const request = new Request('https://intranet.example/', {
      headers: { Cookie: '__Host-arv_session=not-a-token' },
    });
    expect(await getSessionToken(request)).toBeNull();
  });

  it('is cleared with Max-Age=0 and the same attributes', async () => {
    const setCookie = await destroySession();
    const attrs = attributes(setCookie);

    expect(setCookie.startsWith('__Host-arv_session=;')).toBe(true);
    expect(attrs.get('max-age')).toBe('0');
    expect(attrs.get('path')).toBe('/');
    expect(attrs.has('secure')).toBe(true);
  });
});

describe('sign-in-state cookie (sad §6 Critical flow 1)', () => {
  const pending = { state: 'state-123', codeVerifier: VERIFIER, returnTo: '/board' };

  it('is a host-only, HttpOnly, Secure, SameSite=Lax cookie that lives 10 minutes', async () => {
    const setCookie = await commitSignInState(pending);
    const attrs = attributes(setCookie);

    expect(setCookie.startsWith('__Host-arv_sign_in=')).toBe(true);
    expect(attrs.has('httponly')).toBe(true);
    expect(attrs.has('secure')).toBe(true);
    expect(attrs.get('samesite')).toBe('Lax');
    expect(attrs.get('path')).toBe('/');
    expect(attrs.has('domain')).toBe(false);
    expect(attrs.get('max-age')).toBe(String(SIGN_IN_STATE_MAX_AGE_SECONDS));
    expect(SIGN_IN_STATE_MAX_AGE_SECONDS).toBe(600);
  });

  it('round-trips state, verifier and returnTo', async () => {
    const setCookie = await commitSignInState(pending);
    expect(await getSignInState(withCookie(setCookie))).toEqual(pending);
  });

  it('stores an unsafe returnTo as home', async () => {
    const setCookie = await commitSignInState({ ...pending, returnTo: '//evil.example' });
    expect((await getSignInState(withCookie(setCookie)))?.returnTo).toBe('/');
  });

  it('reads nothing from a missing or malformed cookie', async () => {
    expect(await getSignInState(new Request('https://intranet.example/'))).toBeNull();
    const garbage = new Request('https://intranet.example/', {
      headers: { Cookie: `__Host-arv_sign_in=${btoa(JSON.stringify({ state: 'x' }))}` },
    });
    expect(await getSignInState(garbage)).toBeNull();
  });

  it('is cleared with Max-Age=0', async () => {
    const attrs = attributes(await destroySignInState());
    expect(attrs.get('max-age')).toBe('0');
  });
});
