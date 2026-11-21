import { describe, expect, it } from 'vitest';
import { fakeApi, json } from '../../../test/fake-api';
import { ALLOCATION_MESSAGE } from '../allocation';
import { ATLAS } from '../test-data';
import { action } from './board-actions';

const WEB = 'http://web.test';
const args = (extra: { context: unknown; request: Request }) => ({ params: {}, ...extra }) as never;

const apiError = (_tag: string, code: string, message: string, status: number, details?: unknown) =>
  json({ error: { _tag, code, message, ...(details ? { details } : {}) } }, status);

const EMPLOYEE = '01933b8e-0000-7000-8000-000000000301';
const ALLOCATION = '01933b8e-0000-7000-8000-000000000701';

const allocationBody = (extra: Record<string, unknown> = {}) => ({
  id: ALLOCATION,
  employee: { id: EMPLOYEE, fullName: 'Olena Kovalenko', team: null },
  project: ATLAS,
  away: false,
  segments: [
    { startsOn: '2026-11-23', endsOn: '2026-12-04', rateMinutes: 1200, ratePeriod: 'week' },
  ],
  needsAttention: false,
  version: 1,
  lastChangedBy: { id: '01933b8e-0000-7000-8000-000000000201', name: 'Marko Ivanov' },
  lastChangedAt: '2026-11-18T14:32:00.000Z',
  createdAt: '2026-11-10T09:00:00.000Z',
  ...extra,
});

/** The result an action returned with `data()` carries its body in `.data`. */
const body = (result: unknown) =>
  (result as { data?: unknown }).data ?? (result as Record<string, unknown>);
const status = (result: unknown) => (result as { init?: { status?: number } }).init?.status;

const submit = (api: ReturnType<typeof fakeApi>, fields: Record<string, string>) =>
  action(
    args({
      context: api.context,
      request: new Request(`${WEB}/schedule/allocations`, {
        method: 'POST',
        headers: { Origin: WEB },
        body: new URLSearchParams(fields),
      }),
    }),
  );

const create = {
  intent: 'create',
  employeeId: EMPLOYEE,
  projectId: ATLAS.id,
  projectName: ATLAS.name,
  startsOn: '2026-11-23',
  endsOn: '2026-12-04',
  rate: '20',
  ratePeriod: 'week',
};

const overbooking = () =>
  apiError(
    'ConfirmationRequired',
    'scheduling.overbooking_confirmation_required',
    'The resource will be overbooked in 1 week',
    409,
    {
      overbookedWeeks: [
        {
          weekStart: '2026-11-23',
          capacityMinutes: 1920,
          allocatedMinutes: 2400,
          overMinutes: 480,
        },
      ],
      workOnLeaveDays: [],
    },
  );

describe('allocation action: create', () => {
  it('sends the hours as minutes and answers the new id (AC-07)', async () => {
    const api = fakeApi(() => json(allocationBody(), 201));
    const result = await submit(api, create);
    expect(result).toEqual({ ok: true, intent: 'create', allocationId: ALLOCATION });
    const sent = api.requests[0]!;
    expect(sent.method).toBe('POST');
    expect(new URL(sent.url).pathname).toBe('/scheduling/allocations');
    expect(await sent.json()).toEqual({
      employeeId: EMPLOYEE,
      projectId: ATLAS.id,
      startsOn: '2026-11-23',
      endsOn: '2026-12-04',
      rateMinutes: 1200,
      ratePeriod: 'week',
    });
  });

  it('lists the overbooked weeks, then saves only with confirm (AC-10)', async () => {
    let calls = 0;
    const api = fakeApi(() => {
      calls += 1;
      return calls === 1 ? overbooking() : json(allocationBody(), 201);
    });
    const first = await submit(api, create);
    expect(status(first)).toBe(409);
    expect(body(first)).toEqual({
      ok: false,
      kind: 'confirm',
      weeks: [
        {
          weekStart: '2026-11-23',
          capacityMinutes: 1920,
          allocatedMinutes: 2400,
          overMinutes: 480,
        },
      ],
      onLeave: [],
    });
    const second = await submit(api, { ...create, confirm: 'true' });
    expect(second).toMatchObject({ ok: true, intent: 'create' });
    expect(await api.requests[1]!.json()).toMatchObject({ confirm: true });
  });

  it('refuses plain mistakes without calling the api (AC-09)', async () => {
    const api = fakeApi(() => json({}, 500));
    const result = await submit(api, {
      ...create,
      startsOn: '2027-01-04',
      endsOn: '2026-12-31',
      rate: '26.1',
      ratePeriod: 'day',
    });
    expect(status(result)).toBe(400);
    expect(body(result)).toEqual({
      ok: false,
      kind: 'invalid',
      fieldErrors: {
        endsOn: ['End date is before start date'],
        rate: ['Hours must be a multiple of 0.25', 'More than 24h per day'],
      },
    });
    expect(api.requests).toHaveLength(0);
  });

  it('puts each broken rule under its field (AC-09, AC-09b)', async () => {
    const api = fakeApi(() =>
      apiError(
        'ValidationError',
        'scheduling.invalid_allocation',
        'The end date is before the start date',
        400,
        { rules: ['end_before_start', 'hours_over_24_per_working_day', 'starts_before_today'] },
      ),
    );
    expect(body(await submit(api, create))).toEqual({
      ok: false,
      kind: 'invalid',
      fieldErrors: {
        endsOn: ['End date is before start date'],
        rate: ['More than 24h for each working day of the week'],
        startsOn: ['Past plans are not rewritten — choose a start date from today.'],
      },
    });
  });

  it('names the last date the resource can be allocated (AC-13)', async () => {
    const api = fakeApi(() =>
      apiError(
        'ValidationError',
        'scheduling.outside_employment_period',
        'The allocation falls outside the resource’s employment period',
        400,
        { rules: ['outside_employment_period'], lastBookableDate: '2026-12-15' },
      ),
    );
    expect(body(await submit(api, create))).toEqual({
      ok: false,
      kind: 'invalid',
      fieldErrors: {
        endsOn: [
          'The range ends after the employment period — the last date to allocate is 15 Dec 2026.',
        ],
      },
    });
  });

  it('says the project is closed (AC-11)', async () => {
    const api = fakeApi(() =>
      apiError('Conflict', 'scheduling.project_closed', 'The project is closed', 409),
    );
    expect(body(await submit(api, create))).toEqual({
      ok: false,
      kind: 'error',
      error: 'Atlas CRM is closed and accepts no new, changed or removed allocations.',
    });
  });

  it('says the permission is missing and keeps the board (AC-12)', async () => {
    const api = fakeApi(() =>
      apiError('Forbidden', 'scheduling.missing_permission', 'Forbidden', 403),
    );
    const result = await submit(api, create);
    expect(status(result)).toBe(403);
    expect(body(result)).toEqual({
      ok: false,
      kind: 'error',
      error: ALLOCATION_MESSAGE.forbidden,
    });
  });
});

describe('allocation action: change and remove', () => {
  const change = {
    intent: 'change',
    allocationId: ALLOCATION,
    version: '3',
    projectName: ATLAS.name,
    endsOn: '2027-02-05',
    rate: '20',
    ratePeriod: 'week',
  };

  it('sends the version it was opened at and keeps a started allocation’s start (AC-09b)', async () => {
    const api = fakeApi(() => json(allocationBody({ version: 4 })));
    expect(await submit(api, change)).toEqual({
      ok: true,
      intent: 'change',
      allocationId: ALLOCATION,
    });
    const sent = api.requests[0]!;
    expect(sent.method).toBe('PATCH');
    expect(new URL(sent.url).pathname).toBe(`/scheduling/allocations/${ALLOCATION}`);
    expect(await sent.json()).toEqual({
      version: 3,
      endsOn: '2027-02-05',
      rateMinutes: 1200,
      ratePeriod: 'week',
    });
  });

  it('shows the other user’s current values on a conflict (AC-07b)', async () => {
    const api = fakeApi(() =>
      apiError(
        'Conflict',
        'scheduling.version_conflict',
        'Marko Ivanov changed this allocation meanwhile',
        409,
        {
          current: allocationBody({
            version: 4,
            segments: [
              {
                startsOn: '2026-11-02',
                endsOn: '2027-01-15',
                rateMinutes: 960,
                ratePeriod: 'week',
              },
            ],
          }),
        },
      ),
    );
    expect(body(await submit(api, change))).toEqual({
      ok: false,
      kind: 'conflict',
      message: 'Marko Ivanov changed this allocation meanwhile',
      version: 4,
      changedBy: 'Marko Ivanov',
      changedAt: '2026-11-18T14:32:00.000Z',
      current: {
        projectName: 'Atlas CRM',
        startsOn: '2026-11-02',
        endsOn: '2027-01-15',
        rateMinutes: 960,
        ratePeriod: 'week',
      },
    });
  });

  it('removes at the opened version and says how it ended (AC-07a)', async () => {
    const api = fakeApi(() =>
      json({ allocationId: ALLOCATION, outcome: 'ended', endsOn: '2026-11-17' }),
    );
    const result = await submit(api, {
      intent: 'remove',
      allocationId: ALLOCATION,
      version: '2',
    });
    expect(result).toEqual({ ok: true, intent: 'remove', outcome: 'ended', endsOn: '2026-11-17' });
    const sent = api.requests[0]!;
    expect(sent.method).toBe('DELETE');
    expect(new URL(sent.url).searchParams.get('version')).toBe('2');
  });

  it('refuses a foreign origin', async () => {
    const api = fakeApi(() => json({}));
    await expect(
      action(
        args({
          context: api.context,
          request: new Request(`${WEB}/schedule/allocations`, {
            method: 'POST',
            headers: { Origin: 'https://evil.test' },
            body: new URLSearchParams(create),
          }),
        }),
      ),
    ).rejects.toBeTruthy();
    expect(api.requests).toHaveLength(0);
  });
});

describe('allocation action: leave (AC-15)', () => {
  const SICK_LEAVE = '01933b8e-0000-7000-8000-000000000509';
  const leave = {
    intent: 'leave',
    employeeId: EMPLOYEE,
    projectId: SICK_LEAVE,
    projectName: 'Sick leave',
    startsOn: '2026-11-30',
    endsOn: '2026-12-02',
  };
  const leaveBody = () =>
    allocationBody({
      project: { id: SICK_LEAVE, name: 'Sick leave', type: 'leave' },
      away: true,
      segments: [
        {
          startsOn: '2026-11-30',
          endsOn: '2026-12-02',
          rateMinutes: null,
          ratePeriod: 'full-day',
        },
      ],
    });

  it('books whole days on the leave project, with no hours', async () => {
    const api = fakeApi(() => json(leaveBody(), 201));
    expect(await submit(api, leave)).toEqual({
      ok: true,
      intent: 'leave',
      allocationId: ALLOCATION,
    });
    const sent = api.requests[0]!;
    expect(sent.method).toBe('POST');
    expect(new URL(sent.url).pathname).toBe('/scheduling/leave');
    expect(await sent.json()).toEqual({
      employeeId: EMPLOYEE,
      projectId: SICK_LEAVE,
      startsOn: '2026-11-30',
      endsOn: '2026-12-02',
    });
  });

  it('answers the work on the leave days to confirm, then resends with confirm', async () => {
    const api = fakeApi(() =>
      apiError(
        'ConfirmationRequired',
        'scheduling.overbooking_confirmation_required',
        '1 work allocation falls on the leave days',
        409,
        {
          overbookedWeeks: [],
          workOnLeaveDays: [
            { allocationId: ALLOCATION, project: ATLAS, days: ['2026-11-30', '2026-12-01'] },
          ],
        },
      ),
    );
    const result = await submit(api, leave);
    expect(status(result)).toBe(409);
    expect(body(result)).toEqual({
      ok: false,
      kind: 'confirm',
      weeks: [],
      onLeave: [
        { projectId: ATLAS.id, projectName: ATLAS.name, days: ['2026-11-30', '2026-12-01'] },
      ],
    });
    await submit(api, { ...leave, confirm: 'true' });
    expect(await api.requests[1]!.json()).toMatchObject({ confirm: true });
  });

  it('checks the person, leave type and dates before calling the api', async () => {
    const api = fakeApi(() => json(leaveBody(), 201));
    const result = await submit(api, { intent: 'leave', employeeId: '', projectId: '' });
    expect(status(result)).toBe(400);
    expect(body(result)).toEqual({
      ok: false,
      kind: 'invalid',
      fieldErrors: {
        employeeId: [ALLOCATION_MESSAGE.employee],
        projectId: [ALLOCATION_MESSAGE.leaveType],
        startsOn: [ALLOCATION_MESSAGE.date],
        endsOn: [ALLOCATION_MESSAGE.date],
      },
    });
    expect(api.requests).toHaveLength(0);
  });

  it('puts a work project under the leave type field', async () => {
    const api = fakeApi(() =>
      apiError(
        'ValidationError',
        'scheduling.not_a_leave_project',
        'Leave can only be booked on a leave-type project',
        400,
        { rules: ['not_a_leave_project'] },
      ),
    );
    expect(body(await submit(api, { ...leave, projectId: ATLAS.id }))).toEqual({
      ok: false,
      kind: 'invalid',
      fieldErrors: { projectId: [ALLOCATION_MESSAGE.rules.not_a_leave_project] },
    });
  });
});
