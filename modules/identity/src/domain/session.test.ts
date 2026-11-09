import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  generateSessionToken,
  hashSessionToken,
  SESSION_LIFETIME_MS,
  sessionExpiresAt,
  sessionValidity,
} from './session';

const fromBase64Url = (token: string): Uint8Array => {
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

describe('session token', () => {
  it('is 32 random bytes, base64url-encoded without padding', async () => {
    const token = await Effect.runPromise(generateSessionToken);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fromBase64Url(token)).toHaveLength(32);
  });

  it('differs on every call', async () => {
    const [a, b] = await Effect.runPromise(
      Effect.all([generateSessionToken, generateSessionToken]),
    );
    expect(a).not.toBe(b);
  });

  it('hashes deterministically to SHA-256 hex', async () => {
    const a = await Effect.runPromise(hashSessionToken('token'));
    const b = await Effect.runPromise(hashSessionToken('token'));
    expect(a).toBe(b);
    expect(a).toBe('3c469e9d6c5875d37a43f353d4f88e61fcf812c66eee3457465a40b0da4153e0');
    expect(await Effect.runPromise(hashSessionToken('other'))).not.toBe(a);
  });
});

describe('session validity', () => {
  const signedInAt = new Date('2026-01-01T00:00:00.000Z');
  const expiresAt = sessionExpiresAt(signedInAt);

  it('expires 7 days after sign-in', () => {
    expect(expiresAt.toISOString()).toBe('2026-01-08T00:00:00.000Z');
    expect(SESSION_LIFETIME_MS).toBe(604_800_000);
  });

  it('is active just before 7 days', () => {
    const now = new Date(expiresAt.getTime() - 1);
    expect(sessionValidity({ expiresAt, revokedReason: null }, now)._tag).toBe('Active');
  });

  it('is expired exactly at 7 days', () => {
    expect(sessionValidity({ expiresAt, revokedReason: null }, expiresAt)._tag).toBe('Expired');
  });

  it('reports access-removed for a revoked session', () => {
    const now = new Date(signedInAt.getTime() + 1);
    expect(sessionValidity({ expiresAt, revokedReason: 'access-removed' }, now)).toEqual({
      _tag: 'Revoked',
      reason: 'access-removed',
    });
  });

  it('is unknown without a stored session', () => {
    expect(sessionValidity(undefined, signedInAt)._tag).toBe('Unknown');
  });
});
