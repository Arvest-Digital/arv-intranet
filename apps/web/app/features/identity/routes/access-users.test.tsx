import { cleanup, render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeApi, json } from '../../../test/fake-api';
import { anna, roles } from '../test-data';
import AccessUsers, { action, loader } from './access-users';

afterEach(cleanup);

const WEB = 'http://web.test';
const args = (extra: { context: unknown; request: Request }) => ({ params: {}, ...extra }) as never;

const encodedRole = (role: (typeof roles)[number]) => ({
  ...role,
  createdAt: role.createdAt.toISOString(),
});
const encodedAnna = { ...anna, createdAt: anna.createdAt.toISOString() };
const page = (items: unknown[], extra = {}) => ({
  items,
  hasNext: false,
  hasPrev: false,
  nextCursor: null,
  ...extra,
});
const apiError = (_tag: string, code: string, message: string, status: number) =>
  json({ error: { _tag, code, message } }, status);

/** Answers the access list and the access roles like the api does. */
const listApi = () =>
  fakeApi((request) =>
    new URL(request.url).pathname === '/users'
      ? json(page([encodedAnna]))
      : json(page(roles.map(encodedRole))),
  );

describe('access list loader', () => {
  it('loads the page of users and every access role, decoded', async () => {
    const api = listApi();
    const result = await loader(
      args({ context: api.context, request: new Request(`${WEB}/access/users?after=${anna.id}`) }),
    );

    const urls = api.requests.map((r) => new URL(r.url));
    expect(urls.map((u) => u.pathname).sort()).toEqual(['/identity/access-roles', '/users']);
    expect(urls.find((u) => u.pathname === '/users')!.searchParams.get('after')).toBe(anna.id);
    expect(result.page.items[0]!.createdAt).toBeInstanceOf(Date);
    expect(result.roles.map((r) => r.name)).toEqual(['Admin', 'Staff', 'Planner']);
  });

  it('follows the access-role pages', async () => {
    const api = fakeApi((request) => {
      const url = new URL(request.url);
      if (url.pathname === '/users') return json(page([]));
      return url.searchParams.get('after')
        ? json(page(roles.slice(1).map(encodedRole)))
        : json(page([encodedRole(roles[0]!)], { hasNext: true, nextCursor: roles[0]!.id }));
    });
    const result = await loader(
      args({ context: api.context, request: new Request(`${WEB}/access/users`) }),
    );
    expect(result.roles).toHaveLength(3);
  });

  it('refuses with «missing permission» when the api answers 403 (AC-08)', async () => {
    const api = fakeApi(() => apiError('Forbidden', 'identity.missing_permission', 'x', 403));
    await expect(
      loader(args({ context: api.context, request: new Request(`${WEB}/access/users`) })),
    ).rejects.toMatchObject({ data: { reason: 'missing-permission' }, init: { status: 403 } });
  });

  it('throws a 502 when the api fails', async () => {
    const api = fakeApi(() => apiError('InternalError', 'platform.internal_error', 'x', 500));
    await expect(
      loader(args({ context: api.context, request: new Request(`${WEB}/access/users`) })),
    ).rejects.toMatchObject({ init: { status: 502 } });
  });
});

describe('access list action', () => {
  const submit = (
    api: ReturnType<typeof fakeApi>,
    fields: [string, string][],
    origin: string | null = WEB,
  ) =>
    action(
      args({
        context: api.context,
        request: new Request(`${WEB}/access/users`, {
          method: 'POST',
          headers: origin ? { Origin: origin } : {},
          body: new URLSearchParams(fields),
        }),
      }),
    );

  it('adds a user with exactly the ticked roles (AC-04, AC-13)', async () => {
    const api = fakeApi(() => json(encodedAnna, 201));
    const result = await submit(api, [
      ['intent', 'add'],
      ['email', ' anna@arvest.digital '],
      ['name', ' Anna Kovalenko '],
      ['accessRoleId', roles[1]!.id],
      ['accessRoleId', roles[2]!.id],
    ]);

    expect(result).toEqual({ ok: true });
    const request = api.requests[0]!;
    expect([request.method, new URL(request.url).pathname]).toEqual(['POST', '/users']);
    expect(await request.json()).toEqual({
      email: 'anna@arvest.digital',
      name: 'Anna Kovalenko',
      accessRoleIds: [roles[1]!.id, roles[2]!.id],
    });
  });

  it('adds a user with no role when every tick was cleared (AC-13)', async () => {
    const api = fakeApi(() => json({ ...encodedAnna, accessRoles: [] }, 201));
    await submit(api, [
      ['intent', 'add'],
      ['email', 'anna@arvest.digital'],
      ['name', 'Anna'],
    ]);
    expect(await api.requests[0]!.json()).toMatchObject({ accessRoleIds: [] });
  });

  it('shows the duplicate-address 409 inline (AC-06)', async () => {
    const api = fakeApi(() =>
      apiError(
        'Conflict',
        'identity.email_taken',
        'This address is already on the access list',
        409,
      ),
    );
    const result = await submit(api, [
      ['intent', 'add'],
      ['email', 'Anna@arvest.digital'],
      ['name', 'Anna'],
    ]);
    expect(result).toMatchObject({
      data: { ok: false, error: 'This address is already on the access list.', field: 'email' },
      init: { status: 409 },
    });
  });

  it('shows a non-company address under the email (AC-05)', async () => {
    const api = fakeApi(() =>
      apiError('Conflict', 'identity.email_not_company_domain', 'Not a company address', 422),
    );
    const result = await submit(api, [
      ['intent', 'add'],
      ['email', 'bob@example.com'],
      ['name', 'Bob'],
    ]);
    expect(result).toMatchObject({
      data: { ok: false, error: 'Only company-domain addresses can be added.', field: 'email' },
      init: { status: 422 },
    });
  });

  it('renames with the name only, and the user keeps their roles (AC-21)', async () => {
    const api = fakeApi(() => json({ ...encodedAnna, name: 'Anna Koval' }));
    const result = await submit(api, [
      ['intent', 'rename'],
      ['userId', anna.id],
      ['name', 'Anna Koval'],
    ]);

    expect(result).toEqual({ ok: true });
    const request = api.requests[0]!;
    expect([request.method, new URL(request.url).pathname]).toEqual(['PATCH', `/users/${anna.id}`]);
    // Only the name travels: roles are never sent, so the api leaves them as they are.
    expect(await request.json()).toEqual({ name: 'Anna Koval' });
  });

  it('removes a user (AC-07)', async () => {
    const api = fakeApi(() => new Response(null, { status: 204 }));
    const result = await submit(api, [
      ['intent', 'remove'],
      ['userId', anna.id],
    ]);
    expect(result).toEqual({ ok: true });
    expect(api.requests[0]!.method).toBe('DELETE');
    expect(new URL(api.requests[0]!.url).pathname).toBe(`/users/${anna.id}`);
  });

  it('shows «appoint another admin first» for the last-admin 409 (AC-14)', async () => {
    const message = 'The intranet must keep at least one admin. Appoint another admin first.';
    const api = fakeApi(() => apiError('Conflict', 'identity.last_admin_required', message, 409));
    const result = await submit(api, [
      ['intent', 'remove'],
      ['userId', anna.id],
    ]);
    expect(result).toMatchObject({ data: { ok: false, error: message }, init: { status: 409 } });
  });

  it('sets exactly the ticked roles, none allowed (AC-12)', async () => {
    const api = fakeApi(() => json({ ...encodedAnna, accessRoles: [] }));
    await submit(api, [
      ['intent', 'set-roles'],
      ['userId', anna.id],
    ]);
    const request = api.requests[0]!;
    expect([request.method, new URL(request.url).pathname]).toEqual([
      'PUT',
      `/users/${anna.id}/access-roles`,
    ]);
    expect(await request.json()).toEqual({ accessRoleIds: [] });
  });

  it('refuses a foreign origin without calling the api', async () => {
    const api = listApi();
    await expect(
      submit(
        api,
        [
          ['intent', 'remove'],
          ['userId', anna.id],
        ],
        'https://evil.test',
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(api.requests).toHaveLength(0);
  });

  it('refuses with «missing permission» on a 403 (AC-08)', async () => {
    const api = fakeApi(() => apiError('Forbidden', 'identity.missing_permission', 'x', 403));
    await expect(
      submit(api, [
        ['intent', 'remove'],
        ['userId', anna.id],
      ]),
    ).rejects.toMatchObject({ data: { reason: 'missing-permission' } });
  });
});

describe('access list page', () => {
  it('renders the list and the add button, with paging links', async () => {
    const Stub = createRoutesStub([
      {
        path: '/access/users',
        Component: AccessUsers as never,
        loader: () => ({
          page: { items: [anna], hasNext: true, hasPrev: false, nextCursor: anna.id },
          roles,
        }),
      },
    ]);
    render(<Stub initialEntries={['/access/users']} />);

    expect(await screen.findByText('Anna Kovalenko')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Access' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Roles' }).getAttribute('href')).toBe('/access/roles');
    expect(screen.getByRole('button', { name: 'Add user' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toContain(
      `after=${anna.id}`,
    );
    expect(screen.queryByRole('link', { name: 'Previous' })).toBeNull();
  });
});
