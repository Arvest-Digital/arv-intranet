import { describe, expect, it } from 'vitest';
import { fakeApi, json } from '../../test/fake-api';
import { bindingFetch, failure } from './api.server';

const TOKEN = 'a'.repeat(43);

const binding = (api: ReturnType<typeof fakeApi>) =>
  (api.context.cloudflare as { env: { API: Fetcher } }).env.API;

describe('bindingFetch (ADR-0007)', () => {
  it('forwards the session token as Authorization: Bearer, keeping other headers', async () => {
    const api = fakeApi(() => json({}));
    await bindingFetch(binding(api), TOKEN)('https://api.internal/identity/me', {
      headers: { 'Content-Type': 'application/json' },
    });

    const sent = api.requests[0]!;
    expect(sent.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(sent.headers.get('Content-Type')).toBe('application/json');
  });

  it('sends no Authorization header without a token', async () => {
    const api = fakeApi(() => json({}));
    await bindingFetch(binding(api), null)('https://api.internal/identity/sign-in/begin', {
      method: 'POST',
    });

    expect(api.requests[0]!.headers.has('Authorization')).toBe(false);
  });
});

describe('failure', () => {
  it('keeps the api error code and details', async () => {
    const res = json(
      {
        error: {
          _tag: 'Forbidden',
          code: 'identity.not_on_access_list',
          message: 'Not set up',
          details: { admins: [] },
        },
      },
      403,
    );
    expect(await failure(res, 'fallback')).toEqual({
      ok: false,
      status: 403,
      message: 'Not set up',
      code: 'identity.not_on_access_list',
      details: { admins: [] },
    });
  });

  it('falls back when the body is not an api error', async () => {
    expect(await failure(new Response('oops', { status: 502 }), 'fallback')).toEqual({
      ok: false,
      status: 502,
      message: 'fallback',
    });
  });
});
