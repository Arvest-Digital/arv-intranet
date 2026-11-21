import { describe, expect, it } from 'vitest';
import { fakeApi, json } from '../../../test/fake-api';
import { RULE_MESSAGE } from '../employee-record';
import {
  design,
  encoded,
  encodedTeam,
  kateryna,
  logins,
  olena,
  page,
  platform,
} from '../test-data';
import { action, loader } from './employee-records';

const WEB = 'http://web.test';
const args = (extra: { context: unknown; request: Request }) => ({ params: {}, ...extra }) as never;

const apiError = (_tag: string, code: string, message: string, status: number, details?: unknown) =>
  json({ error: { _tag, code, message, ...(details ? { details } : {}) } }, status);

const encodedUser = (login: (typeof logins)[number]) => ({
  ...login,
  accessRoles: [],
  combinedPermissions: [],
  createdAt: '2026-10-01T10:00:00.000Z',
});

/** Answers the records, the teams and the access list like the api does. */
const listApi = (users: () => Response = () => json(page(logins.map(encodedUser)))) =>
  fakeApi((request) => {
    switch (new URL(request.url).pathname) {
      case '/org/employee-records':
        return json(page([encoded(olena), encoded(kateryna)]));
      case '/org/teams':
        return json(page([platform, design].map(encodedTeam)));
      default:
        return users();
    }
  });

const load = (api: ReturnType<typeof fakeApi>) =>
  loader(args({ context: api.context, request: new Request(`${WEB}/people`) }));

describe('employee records loader', () => {
  it('loads every record, team and login, decoded', async () => {
    const api = listApi();
    const result = await load(api);

    expect(api.requests.map((r) => new URL(r.url).pathname).sort()).toEqual([
      '/org/employee-records',
      '/org/teams',
      '/users',
    ]);
    expect(result.records.map((r) => r.fullName)).toEqual(['Olena Kovalenko', 'Kateryna Shevchuk']);
    expect(result.records[0]!.createdAt).toBeInstanceOf(Date);
    expect(result.teams.map((t) => t.name)).toEqual(['Platform', 'Design']);
    expect(result.logins).toEqual(logins);
  });

  it('follows the record pages', async () => {
    const api = fakeApi((request) => {
      const url = new URL(request.url);
      if (url.pathname === '/org/employee-records') {
        return url.searchParams.get('after')
          ? json(page([encoded(kateryna)]))
          : json(page([encoded(olena)], { hasNext: true, nextCursor: olena.id }));
      }
      return json(page([]));
    });
    expect((await load(api)).records).toHaveLength(2);
  });

  it('still loads without access to the access list, offering no login choice', async () => {
    const api = listApi(() => apiError('Forbidden', 'identity.missing_permission', 'x', 403));
    expect((await load(api)).logins).toBeNull();
  });

  it('refuses with «missing permission» when the api answers 403 (AC-22)', async () => {
    const api = fakeApi(() => apiError('Forbidden', 'org.missing_permission', 'x', 403));
    await expect(load(api)).rejects.toMatchObject({
      data: { reason: 'missing-permission' },
      init: { status: 403 },
    });
  });
});

describe('employee records action', () => {
  const submit = (api: ReturnType<typeof fakeApi>, fields: [string, string][], origin = WEB) =>
    action(
      args({
        context: api.context,
        request: new Request(`${WEB}/people`, {
          method: 'POST',
          headers: { Origin: origin },
          body: new URLSearchParams(fields),
        }),
      }),
    );

  const createFields: [string, string][] = [
    ['intent', 'create'],
    ['fullName', ' Nadiia Moroz '],
    ['teamId', platform.id],
    ['contractHours', '24'],
    ['workingDay', '1'],
    ['workingDay', '3'],
    ['workingDay', '2'],
    ['employmentStart', '2026-12-01'],
    ['employmentEnd', ''],
    ['userId', logins[1]!.id],
  ];

  it('creates a record with hours as minutes and the ticked days (AC-19a, AC-19)', async () => {
    const api = fakeApi(() => json(encoded({ ...olena, fullName: 'Nadiia Moroz' }), 201));
    const result = await submit(api, createFields);

    expect(result).toEqual({
      ok: true,
      id: olena.id,
      fullName: 'Nadiia Moroz',
      employmentEnd: null,
    });
    const request = api.requests[0]!;
    expect([request.method, new URL(request.url).pathname]).toEqual([
      'POST',
      '/org/employee-records',
    ]);
    expect(await request.json()).toEqual({
      fullName: 'Nadiia Moroz',
      teamId: platform.id,
      contractMinutes: 1440,
      workingDays: [1, 2, 3],
      employmentStart: '2026-12-01',
      employmentEnd: null,
      userId: logins[1]!.id,
    });
  });

  it('sends empty hours and «No team» / «Not linked» as null (an incomplete record, AC-06)', async () => {
    const api = fakeApi(() => json(encoded(kateryna), 201));
    await submit(api, [
      ['intent', 'create'],
      ['fullName', 'Kateryna Shevchuk'],
      ['teamId', 'none'],
      ['contractHours', ''],
      ['workingDay', '1'],
      ['employmentStart', ''],
      ['userId', 'none'],
    ]);
    expect(await api.requests[0]!.json()).toMatchObject({
      teamId: null,
      contractMinutes: null,
      employmentStart: null,
      userId: null,
    });
  });

  it('leaves the login alone when the form could not offer one', async () => {
    const api = fakeApi(() => json(encoded(olena)));
    await submit(api, [
      ['intent', 'update'],
      ['employeeRecordId', olena.id],
      ['version', '3'],
      ['fullName', 'Olena Kovalenko'],
      ['contractHours', '40'],
      ['workingDay', '1'],
    ]);
    expect(await api.requests[0]!.json()).not.toHaveProperty('userId');
  });

  it('edits at the opened version and resends with confirm (AC-19, AC-19c)', async () => {
    const api = fakeApi(() => json(encoded(olena)));
    await submit(api, [
      ['intent', 'update'],
      ['employeeRecordId', olena.id],
      ['version', '3'],
      ['fullName', 'Olena Kovalenko'],
      ['contractHours', '24'],
      ['workingDay', '1'],
      ['confirm', 'true'],
    ]);
    const request = api.requests[0]!;
    expect([request.method, new URL(request.url).pathname]).toEqual([
      'PATCH',
      `/org/employee-records/${olena.id}`,
    ]);
    expect(await request.json()).toMatchObject({
      version: 3,
      contractMinutes: 1440,
      confirm: true,
    });
  });

  it('names each broken rule under its field (AC-20)', async () => {
    const api = fakeApi(() =>
      apiError('ValidationError', 'platform.validation_failed', 'x', 400, {
        issues: [
          { path: 'contractMinutes', message: 'Contract hours must be above 0' },
          { path: 'workingDays', message: 'Choose at least one working day' },
        ],
      }),
    );
    const result = await submit(api, createFields);
    expect(result).toMatchObject({
      data: {
        ok: false,
        kind: 'invalid',
        fieldErrors: {
          contractHours: RULE_MESSAGE.contractHours,
          workingDays: RULE_MESSAGE.workingDays,
        },
      },
      init: { status: 400 },
    });
  });

  it('puts «end before start» under the end date (AC-20)', async () => {
    const api = fakeApi(() =>
      apiError('ValidationError', 'org.invalid_employee_record', 'x', 400, {
        rules: ['end_before_start'],
      }),
    );
    expect(await submit(api, createFields)).toMatchObject({
      data: { kind: 'invalid', fieldErrors: { employmentEnd: RULE_MESSAGE.endBeforeStart } },
    });
  });

  it('refuses hours that are not a number without calling the api (AC-20)', async () => {
    const api = fakeApi(() => json({}));
    const fields = createFields.map(([k, v]): [string, string] =>
      k === 'contractHours' ? [k, 'abc'] : [k, v],
    );
    expect(await submit(api, fields)).toMatchObject({
      data: { kind: 'invalid', fieldErrors: { contractHours: RULE_MESSAGE.contractHours } },
    });
    expect(api.requests).toHaveLength(0);
  });

  it('names the record a login already belongs to (AC-19b)', async () => {
    const api = fakeApi(() =>
      apiError('Conflict', 'org.login_already_linked', 'x', 409, {
        employeeRecord: { id: olena.id, fullName: 'Marko Ivanov', team: null },
      }),
    );
    expect(await submit(api, createFields)).toMatchObject({
      data: {
        kind: 'invalid',
        fieldErrors: { userId: 'This login is already linked to Marko Ivanov.' },
      },
      init: { status: 409 },
    });
  });

  it('asks to confirm the weeks that would become overbooked (AC-19c)', async () => {
    const api = fakeApi(() =>
      apiError('ConfirmationRequired', 'org.capacity_confirmation_required', 'x', 409, {
        overbookedWeeks: [
          {
            employee: { id: olena.id, fullName: olena.fullName, team: null },
            weekStart: '2026-11-23',
            overMinutes: 480,
          },
        ],
      }),
    );
    expect(await submit(api, createFields)).toMatchObject({
      data: {
        kind: 'confirm',
        weeks: [{ employeeName: olena.fullName, weekStart: '2026-11-23', overMinutes: 480 }],
      },
    });
  });

  it('returns the values someone else saved meanwhile', async () => {
    const api = fakeApi(() =>
      apiError(
        'Conflict',
        'org.version_conflict',
        'Marko Ivanov changed this record meanwhile',
        409,
        {
          current: encoded({ ...olena, version: 4, contractMinutes: 1920 }),
        },
      ),
    );
    const result = (await submit(api, createFields)) as unknown as {
      data: { kind: string; current: { version: number; createdAt: Date } };
    };
    expect(result.data.kind).toBe('conflict');
    expect(result.data.current.version).toBe(4);
    expect(result.data.current.createdAt).toBeInstanceOf(Date);
  });

  it('refuses with «missing permission» when the api answers 403 (AC-22)', async () => {
    const api = fakeApi(() => apiError('Forbidden', 'org.missing_permission', 'x', 403));
    await expect(submit(api, createFields)).rejects.toMatchObject({
      data: { reason: 'missing-permission' },
    });
  });

  it('refuses a post from another origin', async () => {
    const api = fakeApi(() => json({}));
    await expect(submit(api, createFields, 'https://evil.test')).rejects.toBeTruthy();
    expect(api.requests).toHaveLength(0);
  });
});
