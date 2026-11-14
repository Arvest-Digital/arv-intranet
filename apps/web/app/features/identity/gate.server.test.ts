import { describe, expect, it } from 'vitest';
import { commitSession } from '~/shared/lib/session.server';
import { fakeApi, json } from '../../test/fake-api';
import { gate, refusalResponse } from './gate.server';

const WEB = 'http://web.test';
const TOKEN = 't'.repeat(43);
const me = {
  id: '6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91',
  email: 'ann@arvest.digital',
  name: 'Ann',
  permissions: [],
};
const apiError = (_tag: string, code: string, status: number) =>
  json({ error: { _tag, code, message: 'x' } }, status);

async function signedIn(path: string) {
  const cookie = await commitSession({
    sessionToken: TOKEN,
    expiresAt: new Date('2026-11-19T10:00:00.000Z'),
  });
  return new Request(`${WEB}${path}`, { headers: { Cookie: cookie.split(';')[0]! } });
}

const binding = (api: ReturnType<typeof fakeApi>) =>
  (api.context as unknown as { cloudflare: { env: { API: Fetcher } } }).cloudflare.env.API;

/** Runs the gate and returns what it threw. */
async function refused(request: Request, api: ReturnType<typeof fakeApi>) {
  try {
    await gate(request, binding(api));
  } catch (thrown) {
    return thrown as Response & { data?: unknown; init?: ResponseInit };
  }
  throw new Error('the gate let the request through');
}

const locationOf = (res: Response) => new URL(res.headers.get('Location')!, WEB);

describe('root gate (ADR-0002)', () => {
  it('sends an anonymous visit to the sign-in page with returnTo, not to Google (AC-01)', async () => {
    const api = fakeApi(() => json(me));
    const res = await refused(new Request(`${WEB}/board?week=46`), api);

    expect(res.status).toBe(302);
    const location = locationOf(res);
    expect(location.origin).toBe(WEB);
    expect(location.pathname).toBe('/sign-in');
    expect(location.searchParams.get('returnTo')).toBe('/board?week=46');
    expect(api.requests).toHaveLength(0);
  });

  it.each(['/sign-in', '/sign-in/return', '/sign-out', '/sign-in/'])(
    'lets the public page %s through without calling the api',
    async (path) => {
      const api = fakeApi(() => json({}, 500));
      expect(await gate(new Request(`${WEB}${path}`), binding(api))).toBeNull();
      expect(api.requests).toHaveLength(0);
    },
  );

  it('returns who is signed in, asking the api with the Bearer token', async () => {
    const api = fakeApi(() => json(me));
    expect(await gate(await signedIn('/board'), binding(api))).toEqual(me);
    expect(new URL(api.requests[0]!.url).pathname).toBe('/identity/me');
    expect(api.requests[0]!.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('sends an ended session to the sign-in page and clears the cookie (AC-20)', async () => {
    const api = fakeApi(() => apiError('Unauthenticated', 'platform.unauthenticated', 401));
    const res = await refused(await signedIn('/board'), api);

    expect(res.status).toBe(302);
    expect(locationOf(res).searchParams.get('returnTo')).toBe('/board');
    expect(res.headers.get('Set-Cookie')).toMatch(/^__Host-arv_session=;.*Max-Age=0/);
  });

  it('clears the cookie and refuses with «access removed» after a removal (AC-07)', async () => {
    const api = fakeApi(() => apiError('Unauthenticated', 'identity.access_removed', 401));
    const res = await refused(await signedIn('/board'), api);

    expect(res.data).toEqual({ reason: 'access-removed' });
    expect(res.init?.status).toBe(401);
    expect(new Headers(res.init?.headers).get('Set-Cookie')).toMatch(
      /^__Host-arv_session=;.*Max-Age=0/,
    );
  });

  it('fails closed with an error page when the api fails', async () => {
    const api = fakeApi(() => json({}, 500));
    const res = await refused(await signedIn('/board'), api);
    expect(res.init?.status).toBe(502);
    expect(res.data).not.toHaveProperty('id');
  });
});

describe('refusalResponse (feature loaders)', () => {
  const request = new Request(`${WEB}/users`);

  it('turns a 403 into «missing permission» (AC-08)', async () => {
    const res = await refusalResponse({ ok: false, status: 403, message: 'x' }, request);
    expect(res).toMatchObject({ data: { reason: 'missing-permission' }, init: { status: 403 } });
  });

  it('leaves other failures to the caller', async () => {
    expect(await refusalResponse({ ok: false, status: 409, message: 'x' }, request)).toBeNull();
  });
});
