import { describe, expect, it } from 'vitest';
import { fakeApi, json } from '../../../test/fake-api';
import { PROJECT_MESSAGE } from '../project';
import { action, loader } from './projects';

const WEB = 'http://web.test';
const args = (extra: { context: unknown; request: Request }) => ({ params: {}, ...extra }) as never;

const apiError = (_tag: string, code: string, message: string, status: number, details?: unknown) =>
  json({ error: { _tag, code, message, ...(details ? { details } : {}) } }, status);

const atlas = {
  id: '01933b8e-0000-7000-8000-000000000501',
  name: 'Atlas CRM',
  type: 'client',
  closeDate: null,
  status: 'open',
  createdAt: '2026-10-31T09:00:00Z',
};
const beacon = { ...atlas, id: '01933b8e-0000-7000-8000-000000000502', name: 'Beacon mobile' };

const employee = (n: number, fullName: string) => ({
  id: `01933b8e-0000-7000-8000-00000000030${n}`,
  fullName,
  team: null,
});
const impact = {
  closeDate: '2026-12-15',
  endingAtCloseDate: [
    {
      allocationId: '01933b8e-0000-7000-8000-000000000601',
      employee: employee(1, 'Olena Kovalenko'),
      startsOn: '2026-10-26',
      endsOn: '2027-01-29',
    },
  ],
  removed: [
    {
      allocationId: '01933b8e-0000-7000-8000-000000000602',
      employee: employee(2, 'Kateryna Shevchuk'),
      startsOn: '2027-01-04',
      endsOn: '2027-01-29',
    },
  ],
};

const submit = (api: ReturnType<typeof fakeApi>, fields: [string, string][]) =>
  action(
    args({
      context: api.context,
      request: new Request(`${WEB}/projects`, {
        method: 'POST',
        headers: { Origin: WEB },
        body: new URLSearchParams(fields),
      }),
    }),
  );

const createFields: [string, string][] = [
  ['intent', 'create'],
  ['name', ' atlas  '],
  ['type', 'client'],
];
const closeFields: [string, string][] = [
  ['intent', 'close'],
  ['projectId', atlas.id],
  ['closeDate', '2026-12-15'],
];

describe('projects loader', () => {
  it('follows every page of the list', async () => {
    const api = fakeApi((request) =>
      new URL(request.url).searchParams.get('after')
        ? json({ items: [beacon], hasNext: false, hasPrev: true, nextCursor: null })
        : json({ items: [atlas], hasNext: true, hasPrev: false, nextCursor: atlas.id }),
    );
    const result = await loader(
      args({ context: api.context, request: new Request(`${WEB}/projects`) }),
    );
    expect(result.projects.map((p) => p.name)).toEqual(['Atlas CRM', 'Beacon mobile']);
    expect(result.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new URL(api.requests[1]!.url).searchParams.get('after')).toBe(atlas.id);
  });

  it('names manage projects when the list is refused (AC-26)', async () => {
    const api = fakeApi(() => apiError('Forbidden', 'projects.missing_permission', 'x', 403));
    await expect(
      loader(args({ context: api.context, request: new Request(`${WEB}/projects`) })),
    ).rejects.toMatchObject({
      data: { reason: 'missing-permission', permission: 'manage projects' },
      init: { status: 403 },
    });
  });
});

describe('projects action', () => {
  it('creates a project, the name trimmed (AC-23)', async () => {
    const api = fakeApi(() => json(atlas, 201));
    expect(await submit(api, createFields)).toEqual({
      ok: true,
      intent: 'create',
      projectId: atlas.id,
    });
    expect(await api.requests[0]!.json()).toEqual({ name: 'atlas', type: 'client' });
  });

  it('shows a name an open project uses under the name (AC-24)', async () => {
    const api = fakeApi(() => apiError('Conflict', 'projects.duplicate_open_name', 'x', 409));
    expect(await submit(api, createFields)).toMatchObject({
      data: { kind: 'invalid', fieldErrors: { name: PROJECT_MESSAGE.duplicate('atlas') } },
      init: { status: 409 },
    });
    expect(PROJECT_MESSAGE.duplicate('atlas')).toBe(
      'An open project named “atlas” already exists.',
    );
  });

  it('checks the name and type before calling the api', async () => {
    const api = fakeApi(() => json({}));
    const result = await submit(api, [
      ['intent', 'create'],
      ['name', '  '],
      ['type', 'other'],
    ]);
    expect(result).toMatchObject({
      data: { fieldErrors: { name: PROJECT_MESSAGE.name, type: PROJECT_MESSAGE.type } },
    });
    expect(api.requests).toHaveLength(0);
  });

  it('answers with the trims and removals, then resends with confirm (AC-25)', async () => {
    const api = fakeApi(() =>
      apiError('ConfirmationRequired', 'projects.closing_confirmation_required', 'x', 409, impact),
    );
    expect(await submit(api, closeFields)).toMatchObject({
      data: {
        ok: false,
        kind: 'confirm',
        closeDate: '2026-12-15',
        ending: [{ employeeName: 'Olena Kovalenko', startsOn: '2026-10-26', endsOn: '2027-01-29' }],
        removed: [{ employeeName: 'Kateryna Shevchuk', startsOn: '2027-01-04' }],
      },
    });
    const request = api.requests[0]!;
    expect([request.method, new URL(request.url).pathname]).toEqual([
      'POST',
      `/projects/${atlas.id}/close`,
    ]);
    expect(await request.json()).toEqual({ closeDate: '2026-12-15', confirm: false });

    const confirmed = fakeApi(() => json({ ...atlas, closeDate: '2026-12-15' }));
    expect(await submit(confirmed, [...closeFields, ['confirm', 'true']])).toEqual({
      ok: true,
      intent: 'close',
      projectId: atlas.id,
      closeDate: '2026-12-15',
    });
    expect(await confirmed.requests[0]!.json()).toEqual({
      closeDate: '2026-12-15',
      confirm: true,
    });
  });

  it('shows a past close date under the date (AC-25)', async () => {
    const api = fakeApi(() =>
      apiError('ValidationError', 'projects.close_date_in_past', 'x', 400, {
        rules: ['close_date_before_today'],
      }),
    );
    expect(await submit(api, closeFields)).toMatchObject({
      data: { kind: 'invalid', fieldErrors: { closeDate: PROJECT_MESSAGE.closeDateInPast } },
    });
  });

  it('says a closed project can’t be closed again', async () => {
    const api = fakeApi(() => apiError('Conflict', 'projects.project_closed', 'x', 409));
    expect(await submit(api, closeFields)).toMatchObject({
      data: { kind: 'error', error: PROJECT_MESSAGE.closed },
    });
  });

  it.each([
    ['creating', createFields],
    ['closing', closeFields],
  ])('refuses %s without manage-projects, naming it (AC-26)', async (_, fields) => {
    const api = fakeApi(() => apiError('Forbidden', 'projects.missing_permission', 'x', 403));
    await expect(submit(api, fields)).rejects.toMatchObject({
      data: { reason: 'missing-permission', permission: 'manage projects' },
      init: { status: 403 },
    });
  });
});
