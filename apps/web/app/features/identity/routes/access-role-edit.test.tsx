import { cleanup, render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeApi, json } from '../../../test/fake-api';
import { catalog, planner, retiredPlanner, roles } from '../test-data';
import AccessRoleEdit, { action, loader } from './access-role-edit';

afterEach(cleanup);

const WEB = 'http://web.test';
const args = (extra: { context: unknown; request: Request; params?: Record<string, string> }) =>
  ({ params: {}, ...extra }) as never;

const encodedRole = (role: (typeof roles)[number]) => ({
  ...role,
  createdAt: role.createdAt.toISOString(),
});
const page = (items: unknown[]) => ({ items, hasNext: false, hasPrev: false, nextCursor: null });
const apiError = (_tag: string, code: string, message: string, status: number) =>
  json({ error: { _tag, code, message } }, status);
const path = (request: Request) => new URL(request.url).pathname;

/** The api the loader reads: every role, and the permission catalog. */
const readApi = () =>
  fakeApi((request) =>
    path(request) === '/identity/permissions'
      ? json({ items: catalog })
      : json(page([...roles, retiredPlanner].map(encodedRole))),
  );

describe('access role page loader', () => {
  const load = (api: ReturnType<typeof fakeApi>, url: string, params = {}) =>
    loader(args({ context: api.context, request: new Request(`${WEB}${url}`), params }));

  it('loads the permission catalog and no role for a new one', async () => {
    const api = readApi();
    const result = await load(api, '/access/roles/new');

    expect(api.requests.map(path).sort()).toEqual([
      '/identity/access-roles',
      '/identity/permissions',
    ]);
    expect(result.role).toBeUndefined();
    expect(result.catalog.map((p) => p.key)).toEqual(catalog.map((p) => p.key));
  });

  it('loads the role, decoded, with its retired keys', async () => {
    const api = readApi();
    const result = await load(api, `/access/roles/${retiredPlanner.id}`, {
      accessRoleId: retiredPlanner.id,
    });

    expect(result.role!.name).toBe('Board planner');
    expect(result.role!.createdAt).toBeInstanceOf(Date);
    expect(result.role!.retiredPermissionKeys).toEqual(['scheduling:view-board']);
  });

  it('answers 404 for an unknown role', async () => {
    const unknown = '0d4b6c1e-1a2b-4c3d-8e4f-5a6b7c8d9eff';
    await expect(
      load(readApi(), `/access/roles/${unknown}`, { accessRoleId: unknown }),
    ).rejects.toMatchObject({ init: { status: 404 } });
  });

  it('refuses with «missing permission» when the api answers 403 (AC-08)', async () => {
    const api = fakeApi(() => apiError('Forbidden', 'identity.missing_permission', 'x', 403));
    await expect(load(api, '/access/roles/new')).rejects.toMatchObject({
      data: { reason: 'missing-permission' },
      init: { status: 403 },
    });
  });
});

describe('access role page action', () => {
  const submit = (
    api: ReturnType<typeof fakeApi>,
    fields: [string, string][],
    origin: string | null = WEB,
  ) =>
    action(
      args({
        context: api.context,
        request: new Request(`${WEB}/access/roles/new`, {
          method: 'POST',
          headers: origin ? { Origin: origin } : {},
          body: new URLSearchParams(fields),
        }),
      }),
    );
  const isRedirectToRoles = (result: unknown) =>
    result instanceof Response &&
    result.status === 302 &&
    result.headers.get('Location') === '/access/roles';

  it('creates a role with the trimmed name and the ticked keys, then goes back (AC-09)', async () => {
    const api = fakeApi(() => json(encodedRole(planner), 201));
    const result = await submit(api, [
      ['intent', 'create'],
      ['name', ' Planner '],
      ['permissionKey', 'scheduling:edit-allocations'],
    ]);

    expect(isRedirectToRoles(result)).toBe(true);
    // Unticked and not pre-selected: the mark is left alone.
    expect(api.requests).toHaveLength(1);
    const request = api.requests[0]!;
    expect([request.method, path(request)]).toEqual(['POST', '/identity/access-roles']);
    expect(await request.json()).toEqual({
      name: 'Planner',
      permissionKeys: ['scheduling:edit-allocations'],
    });
  });

  it('marks a new role pre-selected when the box is ticked (AC-13)', async () => {
    const api = fakeApi((request) =>
      path(request) === '/identity/preselected-access-role'
        ? json({ accessRoleId: planner.id })
        : json(encodedRole(planner), 201),
    );
    const result = await submit(api, [
      ['intent', 'create'],
      ['name', 'Planner'],
      ['preselected', 'on'],
    ]);

    expect(isRedirectToRoles(result)).toBe(true);
    expect(api.requests.map((r) => [r.method, path(r)])).toEqual([
      ['POST', '/identity/access-roles'],
      ['PUT', '/identity/preselected-access-role'],
    ]);
    expect(await api.requests[1]!.json()).toEqual({ accessRoleId: planner.id });
  });

  it('shows the duplicate-name 409 under the name (AC-10)', async () => {
    const api = fakeApi(() =>
      apiError('Conflict', 'identity.duplicate_access_role_name', 'Duplicate', 409),
    );
    const result = await submit(api, [
      ['intent', 'create'],
      ['name', 'planner '],
    ]);
    expect(result).toMatchObject({
      data: { ok: false, error: 'An access role with that name already exists.', field: 'name' },
      init: { status: 409 },
    });
  });

  it('saves the name and the full key set, a removed retired key left out (AC-16)', async () => {
    // Still pre-selected and still ticked: the mark is left alone.
    const api = fakeApi(() => json(encodedRole(retiredPlanner)));
    const result = await submit(api, [
      ['intent', 'update'],
      ['accessRoleId', retiredPlanner.id],
      ['name', 'Board planner'],
      ['permissionKey', 'scheduling:edit-allocations'],
      ['preselected', 'on'],
    ]);

    expect(isRedirectToRoles(result)).toBe(true);
    expect(api.requests).toHaveLength(1);
    const request = api.requests[0]!;
    expect([request.method, path(request)]).toEqual([
      'PUT',
      `/identity/access-roles/${retiredPlanner.id}`,
    ]);
    expect(await request.json()).toEqual({
      name: 'Board planner',
      permissionKeys: ['scheduling:edit-allocations'],
    });
  });

  it('clears the mark when a pre-selected role is unticked (AC-13)', async () => {
    const api = fakeApi((request) =>
      path(request) === '/identity/preselected-access-role'
        ? json({ accessRoleId: null })
        : json(encodedRole(retiredPlanner)),
    );
    await submit(api, [
      ['intent', 'update'],
      ['accessRoleId', retiredPlanner.id],
      ['name', 'Board planner'],
    ]);
    expect(path(api.requests[1]!)).toBe('/identity/preselected-access-role');
    expect(await api.requests[1]!.json()).toEqual({ accessRoleId: null });
  });

  it('shows a refusal of the mark inline, staying on the page', async () => {
    const message = 'Could not pre-select the role';
    const api = fakeApi((request) =>
      path(request) === '/identity/preselected-access-role'
        ? apiError('Conflict', 'identity.some_conflict', message, 409)
        : json(encodedRole(planner), 201),
    );
    const result = await submit(api, [
      ['intent', 'create'],
      ['name', 'Planner'],
      ['preselected', 'on'],
    ]);
    expect(result).toMatchObject({ data: { ok: false, error: message }, init: { status: 409 } });
  });

  it('refuses with «missing permission» on a 403 (AC-08)', async () => {
    const api = fakeApi(() => apiError('Forbidden', 'identity.missing_permission', 'x', 403));
    await expect(
      submit(api, [
        ['intent', 'create'],
        ['name', 'Planner'],
      ]),
    ).rejects.toMatchObject({ data: { reason: 'missing-permission' } });
  });

  it('refuses a foreign origin without calling the api', async () => {
    const api = fakeApi(() => json({}));
    await expect(
      submit(
        api,
        [
          ['intent', 'create'],
          ['name', 'Planner'],
        ],
        'https://evil.test',
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(api.requests).toHaveLength(0);
  });
});

describe('access role page', () => {
  it('renders the role form for the loaded role', async () => {
    const Stub = createRoutesStub([
      {
        path: '/access/roles/:accessRoleId',
        Component: AccessRoleEdit as never,
        loader: () => ({ role: planner, catalog }),
      },
    ]);
    render(<Stub initialEntries={[`/access/roles/${planner.id}`]} />);

    expect(await screen.findByRole('heading', { name: 'Edit Planner' })).toBeTruthy();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Planner');
    expect(screen.getByRole('button', { name: 'Save role' })).toBeTruthy();
  });
});
