import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Me, Session, SignInCompletion, SignInRedirect } from './sign-in';

// Examples from docs/features/identity/contracts/openapi.yaml (components.examples).
const signInRedirect = {
  authorizationUrl:
    'https://accounts.google.com/o/oauth2/v2/auth?client_id=test-client.apps.example.test&response_type=code&scope=openid%20email%20profile&redirect_uri=https%3A%2F%2Fintranet.example.test%2Fsign-in%2Freturn&state=st_0000000000000000&code_challenge=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&code_challenge_method=S256&hd=example.test',
  state: 'st_0000000000000000',
  codeVerifier: 'vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv',
};
const signInCompletion = {
  code: 'test-authorization-code',
  codeVerifier: 'vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv',
};
const session = {
  sessionToken: 'tttttttttttttttttttttttttttttttttttttttttt0',
  expiresAt: '2026-11-10T09:00:00.000Z',
};
const me = {
  id: '01933b8e-0000-7000-8000-000000000101',
  email: 'user-1@example.test',
  name: 'Test User 1',
  permissions: ['identity:manage-access', 'scheduling:view-whole-board'],
};

const isLeft = (result: Either.Either<unknown, unknown>) => Either.isLeft(result);

describe('SignInRedirect', () => {
  const decode = Schema.decodeUnknownEither(SignInRedirect);

  it('decodes the OpenAPI example', () => {
    expect(decode(signInRedirect)).toEqual(Either.right(signInRedirect));
  });

  it.each([
    ['a relative authorizationUrl', { ...signInRedirect, authorizationUrl: '/auth' }],
    ['an empty state', { ...signInRedirect, state: '' }],
    ['a too short codeVerifier', { ...signInRedirect, codeVerifier: 'short' }],
  ])('rejects %s', (_, input) => {
    expect(isLeft(decode(input))).toBe(true);
  });
});

describe('SignInCompletion', () => {
  const decode = Schema.decodeUnknownEither(SignInCompletion);

  it('decodes the OpenAPI example', () => {
    expect(decode(signInCompletion)).toEqual(Either.right(signInCompletion));
  });

  it.each([
    ['an empty code', { ...signInCompletion, code: '' }],
    [
      'a codeVerifier with forbidden characters',
      { ...signInCompletion, codeVerifier: `${'v'.repeat(42)}!` },
    ],
    ['an unknown key', { ...signInCompletion, state: 'st' }],
  ])('rejects %s', (_, input) => {
    expect(isLeft(decode(input))).toBe(true);
  });
});

describe('Session', () => {
  const decode = Schema.decodeUnknownEither(Session);

  it('decodes the OpenAPI example, expiresAt into a Date, and encodes it back', () => {
    const decoded = Schema.decodeUnknownSync(Session)(session);
    expect(decoded.expiresAt).toBeInstanceOf(Date);
    expect(Schema.encodeSync(Session)(decoded)).toEqual(session);
  });

  it.each([
    ['a token that is not 43 base64url characters', { ...session, sessionToken: 'abc' }],
    ['an unparseable expiresAt', { ...session, expiresAt: 'tomorrow-ish' }],
  ])('rejects %s', (_, input) => {
    expect(isLeft(decode(input))).toBe(true);
  });
});

describe('Me', () => {
  const decode = Schema.decodeUnknownEither(Me);

  it('decodes the OpenAPI example', () => {
    expect(decode(me)).toEqual(Either.right(me));
  });

  it.each([
    ['a malformed permission key', { ...me, permissions: ['ManageAccess'] }],
    [
      'duplicate permissions',
      { ...me, permissions: ['identity:manage-access', 'identity:manage-access'] },
    ],
    ['a non-UUID id', { ...me, id: '42' }],
  ])('rejects %s', (_, input) => {
    expect(isLeft(decode(input))).toBe(true);
  });
});
