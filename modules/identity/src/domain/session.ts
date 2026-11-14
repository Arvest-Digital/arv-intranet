import { type Brand, Data, Effect } from 'effect';

/** The secret kept only in the session cookie: 32 random bytes, base64url without padding. */
export type SessionToken = string & Brand.Brand<'SessionToken'>;

/** What Postgres stores instead of the token: SHA-256 of the token, lower-case hex. */
export type SessionTokenHash = string & Brand.Brand<'SessionTokenHash'>;

export const SESSION_TOKEN_BYTES = 32;

/** Absolute lifetime from sign-in; never extended by activity (ADR-0003). */
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/** A fresh 256-bit token from Web Crypto (works on Workers; no node:crypto). */
export const generateSessionToken: Effect.Effect<SessionToken> = Effect.sync(() => {
  const bytes = crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES));
  return toBase64Url(bytes) as SessionToken;
});

/** Deterministic: the same token always yields the same hash, so a lookup by hash works. */
export const hashSessionToken = (token: string): Effect.Effect<SessionTokenHash> =>
  Effect.promise(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).pipe(
    Effect.map((digest) => toHex(new Uint8Array(digest)) as SessionTokenHash),
  );

export const sessionExpiresAt = (signedInAt: Date): Date =>
  new Date(signedInAt.getTime() + SESSION_LIFETIME_MS);

/** Why a session was ended early. Only removal from the access list revokes (AC-07). */
export type RevocationReason = 'access-removed';

/** The stored facts validity is decided from; `undefined` means no session row for the hash. */
export type StoredSession = {
  readonly expiresAt: Date;
  readonly revokedReason: RevocationReason | null;
};

export type SessionValidity = Data.TaggedEnum<{
  Active: Record<never, never>;
  Expired: Record<never, never>;
  Revoked: { readonly reason: RevocationReason };
  Unknown: Record<never, never>;
}>;

export const SessionValidity = Data.taggedEnum<SessionValidity>();

/**
 * A revoked session reports its reason even past expiry, so a removed user sees
 * «you no longer have access» (AC-07). Expiry is exclusive: at exactly `expiresAt` it is expired.
 */
export const sessionValidity = (session: StoredSession | undefined, now: Date): SessionValidity => {
  if (session === undefined) return SessionValidity.Unknown();
  if (session.revokedReason !== null)
    return SessionValidity.Revoked({ reason: session.revokedReason });
  if (now.getTime() >= session.expiresAt.getTime()) return SessionValidity.Expired();
  return SessionValidity.Active();
};
