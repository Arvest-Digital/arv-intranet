import type { webcrypto } from 'node:crypto';
import { Cause, Effect, Exit } from 'effect';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SignInRefused } from '../application/ports';
import { makeGoogleSignIn, UNAVAILABLE_EVENT } from './google-sign-in';

const CLIENT_ID = 'client-123.apps.googleusercontent.test';
const config = {
  companyDomain: 'arvest.digital',
  firstAdminEmail: '',
  signInReturnUrl: 'https://intranet.example.test/sign-in/return',
  googleClientId: CLIENT_ID,
};
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const KID = 'test-key';

const CODE = 'one-time-code-xyz';
const VERIFIER = 'verifier-abcdefghijklmnopqrstuvwxyz0123456789-ABCDEF';
const EMAIL = 'ann.person@arvest.digital';
const NAME = 'Ann Person';

const rsa = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
} as const;

let googleKey: webcrypto.CryptoKeyPair;
let otherKey: webcrypto.CryptoKeyPair;
let jwks: { keys: webcrypto.JsonWebKey[] };

beforeAll(async () => {
  googleKey = (await crypto.subtle.generateKey(rsa, true, [
    'sign',
    'verify',
  ])) as webcrypto.CryptoKeyPair;
  otherKey = (await crypto.subtle.generateKey(rsa, true, [
    'sign',
    'verify',
  ])) as webcrypto.CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', googleKey.publicKey);
  jwks = { keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' } as webcrypto.JsonWebKey] };
});

afterEach(() => {
  vi.restoreAllMocks();
});

const b64u = (input: string | ArrayBuffer) =>
  Buffer.from(typeof input === 'string' ? input : new Uint8Array(input)).toString('base64url');

const now = () => Math.floor(Date.now() / 1000);

const validClaims = () => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '1234567890',
  iat: now(),
  exp: now() + 3600,
  email: EMAIL,
  email_verified: true,
  hd: 'arvest.digital',
  name: NAME,
});

const signJwt = async (payload: object, key: webcrypto.CryptoKey = googleKey.privateKey) => {
  const header = b64u(JSON.stringify({ alg: 'RS256', kid: KID, typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    rsa.name,
    key,
    new TextEncoder().encode(`${header}.${body}`),
  );
  return `${header}.${body}.${b64u(signature)}`;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A stubbed Google: the token endpoint answers with `token`, the JWKS endpoint with `jwks`. */
const stubGoogle = (
  token: () => Promise<Response> | Response,
  keys: () => Promise<Response> | Response = () => json(jwks),
) => {
  const calls: Array<{ url: string; body: string }> = [];
  const fetchStub = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? String(init.body) : '' });
    if (url === TOKEN_URL) return token();
    if (url === JWKS_URL) return keys();
    throw new Error(`unexpected request to ${url}`);
  });
  return { fetch: fetchStub as unknown as typeof fetch, calls };
};

const tokenResponse = async (idToken: string) =>
  json({ access_token: 'access-token', token_type: 'Bearer', expires_in: 3599, id_token: idToken });

const exchangeWith = (fetchStub: typeof fetch) =>
  Effect.runPromiseExit(
    makeGoogleSignIn(config, { clientSecret: 'secret', fetch: fetchStub }).exchangeCode(
      CODE,
      VERIFIER,
    ),
  );

const exchangeToken = async (payload: object, key?: webcrypto.CryptoKey) => {
  const idToken = await signJwt(payload, key);
  return exchangeWith(stubGoogle(() => tokenResponse(idToken)).fetch);
};

const expectRefused = (exit: Exit.Exit<unknown, SignInRefused>) => {
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Cause.failureOption(exit.cause)).toEqual(
      expect.objectContaining({ value: expect.any(SignInRefused) }),
    );
  }
};

describe('GoogleSignIn.authorizationUrl', () => {
  it('asks Google for openid email profile with PKCE, the company hd and the return URL', async () => {
    const google = makeGoogleSignIn(config, { clientSecret: 'secret' });
    const url = new URL(await Effect.runPromise(google.authorizationUrl('state-1', 'challenge-1')));

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: config.signInReturnUrl,
      scope: 'openid email profile',
      state: 'state-1',
      code_challenge: 'challenge-1',
      code_challenge_method: 'S256',
      hd: 'arvest.digital',
    });
  });
});

describe('GoogleSignIn.exchangeCode', () => {
  it('returns the claims of a valid, Google-signed ID token', async () => {
    const idToken = await signJwt(validClaims());
    const google = stubGoogle(() => tokenResponse(idToken));

    const exit = await exchangeWith(google.fetch);

    expect(exit).toEqual(
      Exit.succeed({ email: EMAIL, email_verified: true, hd: 'arvest.digital', name: NAME }),
    );
    const tokenCall = google.calls.find((call) => call.url === TOKEN_URL);
    const sent = new URLSearchParams(tokenCall?.body);
    expect(sent.get('grant_type')).toBe('authorization_code');
    expect(sent.get('code')).toBe(CODE);
    expect(sent.get('code_verifier')).toBe(VERIFIER);
    expect(sent.get('redirect_uri')).toBe(config.signInReturnUrl);
    expect(sent.get('client_id')).toBe(CLIENT_ID);
    expect(sent.get('client_secret')).toBe('secret');
    // The signature was checked against Google's published keys.
    expect(google.calls.some((call) => call.url === JWKS_URL)).toBe(true);
  });

  it('refuses a token from another issuer', async () => {
    expectRefused(await exchangeToken({ ...validClaims(), iss: 'https://evil.example.test' }));
  });

  it('refuses a token for another audience', async () => {
    expectRefused(await exchangeToken({ ...validClaims(), aud: 'someone-else.apps.test' }));
  });

  it('refuses an expired token', async () => {
    expectRefused(await exchangeToken({ ...validClaims(), iat: now() - 7200, exp: now() - 3600 }));
  });

  it('refuses a token whose signature does not verify against Google’s keys', async () => {
    expectRefused(await exchangeToken(validClaims(), otherKey.privateKey));
  });

  it('refuses a token whose signature was tampered with after signing', async () => {
    const idToken = await signJwt(validClaims());
    const [header, , signature] = idToken.split('.');
    const forged = `${header}.${b64u(JSON.stringify({ ...validClaims(), email: 'boss@arvest.digital' }))}.${signature}`;
    expectRefused(await exchangeWith(stubGoogle(() => tokenResponse(forged)).fetch));
  });

  it('refuses a code Google rejects (invalid_grant)', async () => {
    const exit = await exchangeWith(
      stubGoogle(() => json({ error: 'invalid_grant', error_description: 'Bad Request' }, 400))
        .fetch,
    );
    expectRefused(exit);
  });

  it('refuses a token response without an ID token', async () => {
    const exit = await exchangeWith(
      stubGoogle(() => json({ access_token: 'access-token', token_type: 'Bearer' })).fetch,
    );
    expectRefused(exit);
  });
});

describe('GoogleSignIn.exchangeCode when Google is unavailable', () => {
  const captureConsole = () => {
    const lines: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      });
    }
    return lines;
  };

  const expectUnavailable = (exit: Exit.Exit<unknown, SignInRefused>, lines: string[]) => {
    expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.pretty(exit.cause)).not.toMatch(/one-time-code|verifier|ann|Ann/);
    }
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] ?? '');
    expect(Object.keys(entry).sort()).toEqual(['at', 'event']);
    expect(entry.event).toBe(UNAVAILABLE_EVENT);
    expect(Number.isNaN(Date.parse(entry.at))).toBe(false);
    for (const secret of [CODE, VERIFIER, EMAIL, NAME, 'secret']) {
      expect(lines[0]).not.toContain(secret);
    }
  };

  it('dies and logs only identity.google.unavailable when the token endpoint is down', async () => {
    const lines = captureConsole();
    const exit = await exchangeWith(
      stubGoogle(() => Promise.reject(new TypeError(`fetch failed for ${CODE} ${EMAIL}`))).fetch,
    );
    expectUnavailable(exit, lines);
  });

  it('treats a 5xx from the token endpoint as unavailable', async () => {
    const lines = captureConsole();
    const exit = await exchangeWith(stubGoogle(() => json({ error: 'server_error' }, 503)).fetch);
    expectUnavailable(exit, lines);
  });

  it('treats a 5xx from Google’s JWKS endpoint as unavailable', async () => {
    const idToken = await signJwt(validClaims());
    const lines = captureConsole();
    const exit = await exchangeWith(
      stubGoogle(
        () => tokenResponse(idToken),
        () => json({ error: 'backend' }, 502),
      ).fetch,
    );
    expectUnavailable(exit, lines);
  });

  it('a rejected client (our setup) is a defect but not logged as unavailable', async () => {
    const lines = captureConsole();
    const exit = await exchangeWith(stubGoogle(() => json({ error: 'invalid_client' }, 401)).fetch);
    expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true);
    expect(lines).toEqual([]);
  });

  it('treats a timeout as unavailable', async () => {
    const lines = captureConsole();
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const exit = await Effect.runPromiseExit(
      makeGoogleSignIn(config, {
        clientSecret: 'secret',
        fetch: hanging,
        timeoutMs: 20,
      }).exchangeCode(CODE, VERIFIER),
    );
    expectUnavailable(exit, lines);
  });
});
