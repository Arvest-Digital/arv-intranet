import { describe, expect, it } from 'vitest';
import { fakeApi, json } from '../../test/fake-api';
import { identityGateway } from './identity.server';

const TOKEN = 'a'.repeat(43);
const VERIFIER = 'v'.repeat(43);

const binding = (api: ReturnType<typeof fakeApi>) =>
  (api.context.cloudflare as { env: { API: Fetcher } }).env.API;

const refusal = (code: string, details?: unknown) =>
  json({ error: { _tag: 'Forbidden', code, message: 'Refused', details } }, 403);

describe('identityGateway sign-in', () => {
  it('begins sign-in anonymously and decodes the redirect', async () => {
    const redirect = {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
      state: 'state-123',
      codeVerifier: VERIFIER,
    };
    const api = fakeApi(() => json(redirect));
    const result = await identityGateway(binding(api), null).beginSignIn();

    expect(result).toEqual({ ok: true, value: redirect });
    const sent = api.requests[0]!;
    expect(sent.method).toBe('POST');
    expect(new URL(sent.url).pathname).toBe('/identity/sign-in/begin');
    expect(sent.headers.has('Authorization')).toBe(false);
  });

  it('completes sign-in with the code and verifier and decodes the session', async () => {
    const api = fakeApi(() => json({ sessionToken: TOKEN, expiresAt: '2026-11-18T10:00:00.000Z' }));
    const outcome = await identityGateway(binding(api), null).completeSignIn({
      code: 'google-code',
      codeVerifier: VERIFIER,
    });

    expect(outcome).toEqual({
      kind: 'signed-in',
      session: { sessionToken: TOKEN, expiresAt: new Date('2026-11-18T10:00:00.000Z') },
    });
    expect(await api.requests[0]!.json()).toEqual({ code: 'google-code', codeVerifier: VERIFIER });
  });

  it('turns identity.sign_in_refused into the refused outcome', async () => {
    const api = fakeApi(() => refusal('identity.sign_in_refused'));
    const outcome = await identityGateway(binding(api), null).completeSignIn({
      code: 'c',
      codeVerifier: VERIFIER,
    });
    expect(outcome).toEqual({ kind: 'refused' });
  });

  it('turns identity.not_on_access_list into not-set-up with the admins to ask', async () => {
    const admins = [{ name: 'Ann', email: 'ann@arvest.digital' }];
    const api = fakeApi(() => refusal('identity.not_on_access_list', { admins }));
    const outcome = await identityGateway(binding(api), null).completeSignIn({
      code: 'c',
      codeVerifier: VERIFIER,
    });
    expect(outcome).toEqual({ kind: 'not-set-up', admins });
  });

  it('reports any other failure as failed', async () => {
    const api = fakeApi(() =>
      json(
        { error: { _tag: 'InternalError', code: 'platform.internal_error', message: 'x' } },
        500,
      ),
    );
    const outcome = await identityGateway(binding(api), null).completeSignIn({
      code: 'c',
      codeVerifier: VERIFIER,
    });
    expect(outcome).toEqual({ kind: 'failed', status: 500, message: 'x' });
  });
});

describe('identityGateway signed-in calls', () => {
  it('gets me with the Bearer token', async () => {
    const me = {
      id: '6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91',
      email: 'ann@arvest.digital',
      name: 'Ann',
      permissions: ['identity:manage-access'],
    };
    const api = fakeApi(() => json(me));
    const result = await identityGateway(binding(api), TOKEN).getMe();

    expect(result).toEqual({ ok: true, value: me });
    expect(api.requests[0]!.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('reports 401 with the access-removed code', async () => {
    const api = fakeApi(() =>
      json(
        {
          error: {
            _tag: 'Unauthenticated',
            code: 'identity.access_removed',
            message: 'You no longer have access to the intranet',
          },
        },
        401,
      ),
    );
    const result = await identityGateway(binding(api), TOKEN).getMe();
    expect(result).toMatchObject({ ok: false, status: 401, code: 'identity.access_removed' });
  });

  it('signs out with the Bearer token', async () => {
    const api = fakeApi(() => new Response(null, { status: 204 }));
    const result = await identityGateway(binding(api), TOKEN).signOut();

    expect(result).toEqual({ ok: true, value: null });
    const sent = api.requests[0]!;
    expect(sent.method).toBe('POST');
    expect(new URL(sent.url).pathname).toBe('/identity/sign-out');
    expect(sent.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
  });
});
