import { Effect } from 'effect';
import { GoogleSignIn } from './ports';

/** 32 random bytes → 43 base64url characters: within PKCE's 43–128 (RFC 7636 §4.1). */
const RANDOM_BYTES = 32;

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** 256 random bits from Web Crypto (works on Workers), base64url without padding. */
const randomBase64Url = Effect.sync(() =>
  toBase64Url(crypto.getRandomValues(new Uint8Array(RANDOM_BYTES))),
);

/** PKCE `S256`: base64url(SHA-256(verifier)) (RFC 7636 §4.2). */
export const pkceChallenge = (codeVerifier: string): Effect.Effect<string> =>
  Effect.promise(() =>
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier)),
  ).pipe(Effect.map((digest) => toBase64Url(new Uint8Array(digest))));

/** What web needs to send the person to Google and to finish sign-in on return (ADR-0007). */
export interface SignInStart {
  readonly authorizationUrl: string;
  /** Anti-forgery value web keeps in its short-lived cookie and checks on return. */
  readonly state: string;
  /** PKCE verifier; web keeps it and sends it back to `completeSignIn`. Never stored here. */
  readonly codeVerifier: string;
}

/** Critical flow 1, first leg: Google's sign-in address with a fresh `state` and PKCE pair. */
export const beginSignIn = () =>
  Effect.gen(function* () {
    const google = yield* GoogleSignIn;
    const state = yield* randomBase64Url;
    const codeVerifier = yield* randomBase64Url;
    const authorizationUrl = yield* google.authorizationUrl(
      state,
      yield* pkceChallenge(codeVerifier),
    );
    return { authorizationUrl, state, codeVerifier } satisfies SignInStart;
  });
