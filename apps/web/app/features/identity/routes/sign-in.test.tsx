import { cleanup, render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { commitSession } from '~/shared/lib/session.server';
import { fakeApi, json } from '../../../test/fake-api';
import SignIn, { action, loader } from './sign-in';
import SignInReturn, { loader as returnLoader } from './sign-in-return';
import { action as signOutAction } from './sign-out';

afterEach(cleanup);

const WEB = 'http://web.test';
const args = (extra: { context?: unknown; request: Request }) =>
  ({ params: {}, ...extra }) as never;
const noApi = () => fakeApi(() => json({}, 500));

const redirectTo = {
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=st_0000000000000000',
  state: 'st_0000000000000000',
  codeVerifier: 'vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv',
};
const session = {
  sessionToken: 't'.repeat(43),
  expiresAt: '2026-11-19T10:00:00.000Z',
};
const apiError = (code: string, status: number, details?: unknown) =>
  json(
    { error: { _tag: 'Forbidden', code, message: 'x', ...(details ? { details } : {}) } },
    status,
  );

/** Posts the sign-in button and returns the state cookie it sets. */
async function beginCookie(returnTo: string) {
  const api = fakeApi(() => json(redirectTo));
  const res = (await action(
    args({
      context: api.context,
      request: new Request(`${WEB}/sign-in`, {
        method: 'POST',
        headers: { Origin: WEB },
        body: new URLSearchParams({ returnTo }),
      }),
    }),
  )) as Response;
  return res.headers.get('Set-Cookie')!.split(';')[0]!;
}

const returnRequest = (query: string, cookie?: string) =>
  new Request(`${WEB}/sign-in/return?${query}`, cookie ? { headers: { Cookie: cookie } } : {});

describe('sign-in page (AC-20)', () => {
  it('renders the button and keeps a safe returnTo, without calling the api', async () => {
    const api = noApi();
    const data = loader(
      args({ context: api.context, request: new Request(`${WEB}/sign-in?returnTo=/users`) }),
    );
    expect(data).toEqual({ returnTo: '/users', signedOut: false });
    expect(api.requests).toHaveLength(0);

    const Stub = createRoutesStub([{ path: '/sign-in', Component: SignIn, loader: () => data }]);
    render(<Stub initialEntries={['/sign-in']} />);
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeTruthy();
    expect((document.querySelector('input[name=returnTo]') as HTMLInputElement).value).toBe(
      '/users',
    );
  });

  it('drops an unsafe returnTo', () => {
    const data = loader(args({ request: new Request(`${WEB}/sign-in?returnTo=//evil.test`) }));
    expect(data.returnTo).toBe('/');
  });

  it('POST begins and redirects to Google with the state cookie', async () => {
    const api = fakeApi(() => json(redirectTo));
    const res = (await action(
      args({
        context: api.context,
        request: new Request(`${WEB}/sign-in`, {
          method: 'POST',
          headers: { Origin: WEB },
          body: new URLSearchParams({ returnTo: '/users' }),
        }),
      }),
    )) as Response;

    expect(new URL(api.requests[0]!.url).pathname).toBe('/identity/sign-in/begin');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(redirectTo.authorizationUrl);
    expect(res.headers.get('Set-Cookie')).toMatch(/^__Host-arv_sign_in=/);
  });

  it('POST from another origin is refused before the api is called', async () => {
    const api = fakeApi(() => json(redirectTo));
    const call = action(
      args({
        context: api.context,
        request: new Request(`${WEB}/sign-in`, {
          method: 'POST',
          headers: { Origin: 'https://evil.test' },
          body: new URLSearchParams(),
        }),
      }),
    );
    await expect(call).rejects.toMatchObject({ status: 403 });
    expect(api.requests).toHaveLength(0);
  });
});

describe('sign-in return (AC-01, AC-02, AC-03)', () => {
  it('refuses a state that does not match the cookie, without calling the api', async () => {
    const cookie = await beginCookie('/users');
    const api = noApi();
    const res = await returnLoader(
      args({ context: api.context, request: returnRequest('state=other&code=c', cookie) }),
    );
    expect(res).toMatchObject({ data: { screen: 'problem' }, init: { status: 400 } });
    expect(api.requests).toHaveLength(0);
  });

  it('refuses a return without the state cookie', async () => {
    const res = await returnLoader(
      args({
        context: noApi().context,
        request: returnRequest(`state=${redirectTo.state}&code=c`),
      }),
    );
    expect(res).toMatchObject({ data: { screen: 'problem' }, init: { status: 400 } });
  });

  it('on success sets the session cookie, clears the state and redirects to returnTo', async () => {
    const cookie = await beginCookie('/users?page=2');
    const api = fakeApi(() => json(session));
    const res = (await returnLoader(
      args({
        context: api.context,
        request: returnRequest(`state=${redirectTo.state}&code=c0de`, cookie),
      }),
    )) as Response;

    expect(await api.requests[0]!.json()).toEqual({
      code: 'c0de',
      codeVerifier: redirectTo.codeVerifier,
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/users?page=2');
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith(`__Host-arv_session=`))).toBe(true);
    expect(cookies.some((c) => /^__Host-arv_sign_in=;.*Max-Age=0/.test(c))).toBe(true);
  });

  it.each([
    [
      'refused',
      apiError('identity.sign_in_refused', 403),
      'Only verified company Google accounts can sign in.',
    ],
    [
      'not-set-up',
      apiError('identity.not_on_access_list', 403, {
        admins: [{ name: 'Ann Admin', email: 'ann@arvest.digital' }],
      }),
      'ann@arvest.digital',
    ],
    ['problem', json({}, 500), 'Something went wrong. Try again.'],
  ])('renders the %s screen', async (screenName, response, text) => {
    const cookie = await beginCookie('/');
    const api = fakeApi(() => response);
    const result = (await returnLoader(
      args({
        context: api.context,
        request: returnRequest(`state=${redirectTo.state}&code=c`, cookie),
      }),
    )) as { data: { screen: string } };
    expect(result.data.screen).toBe(screenName);

    const Stub = createRoutesStub([
      { path: '/sign-in/return', Component: SignInReturn as never, loader: () => result.data },
    ]);
    render(<Stub initialEntries={['/sign-in/return']} />);
    expect(await screen.findByText(text)).toBeTruthy();
  });

  it('says to ask a manager when there are no admins', async () => {
    const Stub = createRoutesStub([
      {
        path: '/r',
        Component: SignInReturn as never,
        loader: () => ({ screen: 'not-set-up', admins: [] }),
      },
    ]);
    render(<Stub initialEntries={['/r']} />);
    expect(await screen.findByText(/Ask your manager\./)).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('sign-out (AC-20)', () => {
  it('calls the api with the session and clears the cookie', async () => {
    const api = fakeApi(() => new Response(null, { status: 204 }));
    const res = (await signOutAction(
      args({
        context: api.context,
        request: new Request(`${WEB}/sign-out`, {
          method: 'POST',
          headers: {
            Origin: WEB,
            Cookie: (
              await commitSession({ ...session, expiresAt: new Date(session.expiresAt) })
            ).split(';')[0]!,
          },
        }),
      }),
    )) as Response;

    expect(new URL(api.requests[0]!.url).pathname).toBe('/identity/sign-out');
    expect(api.requests[0]!.headers.get('Authorization')).toBe(`Bearer ${session.sessionToken}`);
    expect(res.headers.get('Location')).toBe('/sign-in?signedOut');
    expect(res.headers.get('Set-Cookie')).toMatch(/^__Host-arv_session=;.*Max-Age=0/);
  });
});
