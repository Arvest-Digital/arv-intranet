import { cleanup, render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeApi, json } from '../../../test/fake-api';
import { catalog, planner, retiredPlanner, roles } from '../test-data';
import AccessRoles, { action, loader } from './access-roles';

afterEach(cleanup);

const WEB = 'http://web.test';
const args = (extra: { context: unknown; request: Request }) => ({ params: {}, ...extra }) as never;

const encodedRole = (role: (typeof roles)[number]) => ({
  ...role,
  createdAt: role.createdAt.toISOString(),
});
const page = (items: unknown[]) => ({ items, hasNext: false, hasPrev: false, nextCursor: null });
const apiError = (_tag: string, code: string, message: string, status: number) =>
  json({ error: { _tag, code, message } }, status);

describe('access roles loader', () => {
  it('loads every role and the permission catalog, decoded', async () => {
    const api = fakeApi((request) =>
      new URL(request.url).pathname === '/identity/permissions'
        ? json({ items: catalog })
        : json(page([...roles, retiredPlanner].map(encodedRole))),
    );
    const result = await loader(
      args({ context: api.context, request: new Request(`${WEB}/access/roles`) }),
    );

    expect(api.requests.map((r) => new URL(r.url).pathname).sort()).toEqual([
      '/identity/access-roles',
      '/identity/permissions',
    ]);
    expect(result.roles.at(-1)!.retiredPermissionKeys).toEqual(['scheduling:view-board']);
    expect(result.roles[0]!.createdAt).toBeInstanceOf(Date);
    expect(result.catalog.map((p) => p.key)).toEqual(catalog.map((p) => p.key));
  });

  it('refuses with «missing permission» when the api answers 403 (AC-08)', async () => {
    const api = fakeApi(() => apiError('Forbidden', 'identity.missing_permission', 'x', 403));
    await expect(
      loader(args({ context: api.context, request: new Request(`${WEB}/access/roles`) })),
    ).rejects.toMatchObject({ data: { reason: 'missing-permission' }, init: { status: 403 } });
  });
});

describe('access roles action', () => {
  const submit = (
    api: ReturnType<typeof fakeApi>,
    fields: [string, string][],
    origin: string | null = WEB,
  ) =>
    action(
      args({
        context: api.context,
        request: new Request(`${WEB}/access/roles`, {
          method: 'POST',
          headers: origin ? { Origin: origin } : {},
          body: new URLSearchParams(fields),
        }),
      }),
    );

  it('creates a role with the trimmed name and the ticked keys (AC-09)', async () => {
    const api = fakeApi(() => json(encodedRole(planner), 201));
    const result = await submit(api, [
      ['intent', 'create'],
      ['name', ' Planner '],
      ['permissionKey', 'scheduling:edit-allocations'],
    ]);

    expect(result).toEqual({ ok: true });
    const request = api.requests[0]!;
    expect([request.method, new URL(request.url).pathname]).toEqual([
      'POST',
      '/identity/access-roles',
    ]);
    expect(await request.json()).toEqual({
      name: 'Planner',
      permissionKeys: ['scheduling:edit-allocations'],
    });
  });

  it('shows the duplicate-name 409 inline (AC-10)', async () => {
    const message = 'An access role with that name already exists';
    const api = fakeApi(() =>
      apiError('Conflict', 'identity.duplicate_access_role_name', message, 409),
    );
    const result = await submit(api, [
      ['intent', 'create'],
      ['name', 'planner '],
    ]);
    expect(result).toMatchObject({ data: { ok: false, error: message }, init: { status: 409 } });
  });

  it('saves the name and the full key set, a removed retired key left out (AC-16)', async () => {
    const api = fakeApi(() => json(encodedRole(planner)));
    await submit(api, [
      ['intent', 'update'],
      ['accessRoleId', retiredPlanner.id],
      ['name', 'Board planner'],
      ['permissionKey', 'scheduling:edit-allocations'],
    ]);
    const request = api.requests[0]!;
    expect([request.method, new URL(request.url).pathname]).toEqual([
      'PUT',
      `/identity/access-roles/${retiredPlanner.id}`,
    ]);
    expect(await request.json()).toEqual({
      name: 'Board planner',
      permissionKeys: ['scheduling:edit-allocations'],
    });
  });

  it('deletes a role (AC-11) and shows the last-admin 409 inline (AC-14)', async () => {
    const ok = fakeApi(() => new Response(null, { status: 204 }));
    expect(
      await submit(ok, [
        ['intent', 'delete'],
        ['accessRoleId', planner.id],
      ]),
    ).toEqual({ ok: true });
    expect(ok.requests[0]!.method).toBe('DELETE');

    const message = 'The intranet must keep at least one admin. Appoint another admin first.';
    const refused = fakeApi(() =>
      apiError('Conflict', 'identity.last_admin_required', message, 409),
    );
    expect(
      await submit(refused, [
        ['intent', 'delete'],
        ['accessRoleId', planner.id],
      ]),
    ).toMatchObject({ data: { ok: false, error: message }, init: { status: 409 } });
  });

  it('marks a role pre-selected, and clears the mark with an empty id (AC-13)', async () => {
    const mark = fakeApi(() => json({ accessRoleId: planner.id }));
    await submit(mark, [
      ['intent', 'preselect'],
      ['accessRoleId', planner.id],
    ]);
    expect(new URL(mark.requests[0]!.url).pathname).toBe('/identity/preselected-access-role');
    expect(await mark.requests[0]!.json()).toEqual({ accessRoleId: planner.id });

    const clear = fakeApi(() => json({ accessRoleId: null }));
    await submit(clear, [
      ['intent', 'preselect'],
      ['accessRoleId', ''],
    ]);
    expect(await clear.requests[0]!.json()).toEqual({ accessRoleId: null });
  });

  it('refuses a foreign origin without calling the api', async () => {
    const api = fakeApi(() => json({}));
    await expect(
      submit(
        api,
        [
          ['intent', 'delete'],
          ['accessRoleId', planner.id],
        ],
        'https://evil.test',
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(api.requests).toHaveLength(0);
  });
});

describe('access roles page', () => {
  it('renders the roles and the new-role button', async () => {
    const Stub = createRoutesStub([
      {
        path: '/access/roles',
        Component: AccessRoles as never,
        loader: () => ({ roles: [planner, retiredPlanner], catalog }),
      },
    ]);
    render(<Stub initialEntries={['/access/roles']} />);

    expect(await screen.findByText('Board planner')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New access role' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Users' }).getAttribute('href')).toBe('/access/users');
  });
});
