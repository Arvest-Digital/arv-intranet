import { Effect, Layer } from 'effect';
import * as oauth from 'oauth4webapi';
import { GoogleSignIn, IdentityConfig, SignInRefused } from '../application/ports';
import type { SignInClaims } from '../domain/sign-in-eligibility';

/**
 * Google OpenID Connect, server leg (ADR-0003, ADR-0007), on `oauth4webapi`.
 *
 * - Authorization-code flow with PKCE (S256); the web keeps `state` and the verifier.
 * - The ID token's issuer, audience and expiry are checked by `processAuthorizationCodeResponse`,
 *   and its JWS signature against Google's JWKS by `validateApplicationLevelSignature`.
 * - Google unreachable (network error, timeout, 5xx/429 from the token or JWKS endpoint) is a
 *   defect, logged once as `identity.google.unavailable` with a timestamp only (sad §8 Logging).
 * - A rejected code or a token failing any check is `SignInRefused`, logged nowhere.
 * - Anything else (our client rejected, a library misuse) is a defect with a fixed message.
 *
 * Nothing here logs or puts into a defect the code, the verifier, the token or any claim.
 */

/** Google's OpenID Provider metadata (from its discovery document), fixed to save a request. */
const google: oauth.AuthorizationServer = {
  issuer: 'https://accounts.google.com',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  id_token_signing_alg_values_supported: ['RS256'],
};

export const UNAVAILABLE_EVENT = 'identity.google.unavailable';

export interface GoogleSignInOptions {
  /** `GOOGLE_CLIENT_SECRET`; it lives only in the api (ADR-0007). */
  readonly clientSecret: string;
  /** Per-request timeout for the token and JWKS endpoints. Default 10 s. */
  readonly timeoutMs?: number;
  /** For tests: replaces the global `fetch`. */
  readonly fetch?: typeof fetch;
}

/** Thrown by the fetch wrapper so transport failures are told apart from refusals. */
class GoogleUnreachable extends Error {}

type Outcome =
  | { readonly _tag: 'Claims'; readonly claims: SignInClaims }
  | { readonly _tag: 'Refused' }
  | { readonly _tag: 'Unavailable' }
  | { readonly _tag: 'Failed' };

/** OAuth errors that mean «this code is no good» — the person's attempt, not our setup. */
const REFUSED_OAUTH_ERRORS = new Set(['invalid_grant', 'invalid_request']);

const logUnavailable = Effect.sync(() => {
  // Timestamp only: no code, verifier, claim, email or name (sad §8 Logging).
  console.error(JSON.stringify({ event: UNAVAILABLE_EVENT, at: new Date().toISOString() }));
});

const toEffect = (outcome: Outcome): Effect.Effect<SignInClaims, SignInRefused> => {
  switch (outcome._tag) {
    case 'Claims':
      return Effect.succeed(outcome.claims);
    case 'Refused':
      return Effect.fail(new SignInRefused());
    case 'Unavailable':
      return logUnavailable.pipe(Effect.zipRight(Effect.dieMessage(UNAVAILABLE_EVENT)));
    default:
      // `Failed`. A fixed message, no cause: the error may hold the code or the token.
      return Effect.dieMessage('identity.google.exchange_failed');
  }
};

export const makeGoogleSignIn = (
  config: IdentityConfig['Type'],
  options: GoogleSignInOptions,
): GoogleSignIn['Type'] => {
  // One `AuthorizationServer` object per adapter: oauth4webapi caches the JWKS against it.
  const as: oauth.AuthorizationServer = { ...google };
  const client: oauth.Client = {
    client_id: config.googleClientId,
    id_token_signed_response_alg: 'RS256',
  };
  const clientAuth = oauth.ClientSecretPost(options.clientSecret);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const baseFetch = options.fetch ?? fetch;

  const guardedFetch = async (url: string, init: RequestInit): Promise<Response> => {
    let response: Response;
    try {
      response = await baseFetch(url, init);
    } catch {
      throw new GoogleUnreachable();
    }
    if (response.status >= 500 || response.status === 429) {
      await response.body?.cancel();
      throw new GoogleUnreachable();
    }
    return response;
  };

  const requestOptions = () => ({
    [oauth.customFetch]: guardedFetch,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const exchange = async (code: string, codeVerifier: string): Promise<Outcome> => {
    try {
      const response = await oauth.authorizationCodeGrantRequest(
        as,
        client,
        clientAuth,
        // `state` was already checked by the web against its cookie (ADR-0007).
        oauth.validateAuthResponse(as, client, new URLSearchParams({ code }), oauth.skipStateCheck),
        config.signInReturnUrl,
        codeVerifier,
        requestOptions(),
      );
      // Issuer, audience, expiry (and iat, alg, no unexpected nonce) are checked here.
      const result = await oauth.processAuthorizationCodeResponse(as, client, response, {
        requireIdToken: true,
      });
      // The ID token's JWS signature against Google's published keys.
      await oauth.validateApplicationLevelSignature(as, response, requestOptions());
      const idToken = oauth.getValidatedIdTokenClaims(result);
      if (idToken === undefined) return { _tag: 'Refused' };
      return {
        _tag: 'Claims',
        claims: {
          email: idToken.email,
          email_verified: idToken.email_verified,
          hd: idToken.hd,
          name: idToken.name,
        },
      };
    } catch (error) {
      if (error instanceof GoogleUnreachable) return { _tag: 'Unavailable' };
      if (error instanceof oauth.ResponseBodyError) {
        // A rejected code is the person's attempt; e.g. `invalid_client` is our setup.
        return REFUSED_OAUTH_ERRORS.has(error.error) ? { _tag: 'Refused' } : { _tag: 'Failed' };
      }
      if (
        error instanceof oauth.OperationProcessingError ||
        error instanceof oauth.UnsupportedOperationError ||
        error instanceof oauth.WWWAuthenticateChallengeError
      ) {
        // A token failing any claim, algorithm or signature check, or a malformed response.
        return { _tag: 'Refused' };
      }
      // Anything else (e.g. a misuse of the library) is a bug, not a refusal.
      return { _tag: 'Failed' };
    }
  };

  return {
    authorizationUrl: (state, codeChallenge) =>
      Effect.sync(() => {
        const url = new URL(google.authorization_endpoint as string);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('client_id', config.googleClientId);
        url.searchParams.set('redirect_uri', config.signInReturnUrl);
        url.searchParams.set('scope', 'openid email profile');
        url.searchParams.set('state', state);
        url.searchParams.set('code_challenge', codeChallenge);
        url.searchParams.set('code_challenge_method', 'S256');
        url.searchParams.set('hd', config.companyDomain);
        return url.toString();
      }),
    exchangeCode: (code, codeVerifier) =>
      Effect.promise(() => exchange(code, codeVerifier)).pipe(Effect.flatMap(toEffect)),
  };
};

/** The live adapter; the host passes the client secret (it is not part of `IdentityConfig`). */
export const GoogleSignInLive = (options: GoogleSignInOptions) =>
  Layer.effect(
    GoogleSignIn,
    Effect.map(IdentityConfig, (config) => makeGoogleSignIn(config, options)),
  );
