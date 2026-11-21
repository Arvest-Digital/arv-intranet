import {
  makeAccessRole,
  makeEmployeeRecord,
  makeSession,
  makeTeam,
  makeUser,
  seedAccessRoles,
  seedEmployeeRecords,
  seedSessions,
  seedTeams,
  seedUserAccessRoles,
  seedUsers,
} from '@arv/db/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, resetDb, withDb } from '../../helpers';

/**
 * T12 — employee-record endpoints (openapi.yaml `listEmployeeRecords`, `createEmployeeRecord`,
 * `getEmployeeRecord`, `updateEmployeeRecord`; AC-19a, AC-19b, AC-19, AC-20, AC-22) through the
 * real Worker and its own composition, with `CapacityImpactCheck` still on its no-op default.
 */

beforeEach(resetDb);

const MANAGE_EMPLOYEE_RECORDS = 'org:manage-employee-records';
const UNKNOWN_ID = '01933b8e-0000-7000-8000-00000000ffff';

type Call = { readonly method?: string; readonly token?: string; readonly body?: unknown };

const call = (path: string, { method = 'GET', token, body }: Call = {}) => {
  const headers = new Headers();
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return api(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

/** OpenAPI `EmployeeRecord` as it arrives on the wire. */
type RecordBody = {
  id: string;
  fullName: string;
  userId: string | null;
  team: { id: string; name: string } | null;
  contractMinutes: number | null;
  workingDays: number[];
  employmentStart: string | null;
  employmentEnd: string | null;
  incomplete: boolean;
  version: number;
  lastChangedBy: { id: string; name: string };
  lastChangedAt: string;
  createdAt: string;
};
type PageBody = {
  items: RecordBody[];
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor: string | null;
};
type ErrorBody = {
  _tag: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

const recordOf = async (res: Response) => (await res.json()) as RecordBody;
const pageOf = async (res: Response) => (await res.json()) as PageBody;
const errorOf = async (res: Response) => ((await res.json()) as { error: ErrorBody }).error;

/**
 * A manager holding `org:manage-employee-records`, a planner holding only a scheduling
 * permission, two spare logins, and the team «Platform»; each manager/planner with a session.
 */
const setup = () =>
  withDb(async (db) => {
    const [manager, planner, joinerLogin, otherLogin] = await seedUsers(db, [
      makeUser({ name: 'Test User 2' }),
      makeUser(),
      makeUser(),
      makeUser(),
    ]);
    const [managers, planners] = await seedAccessRoles(db, [
      makeAccessRole({ name: 'Managers', permissionKeys: [MANAGE_EMPLOYEE_RECORDS] }),
      makeAccessRole({ name: 'Planners', permissionKeys: ['scheduling:edit-allocations'] }),
    ]);
    await seedUserAccessRoles(db, [
      { userId: manager!.id, accessRoleId: managers!.id },
      { userId: planner!.id, accessRoleId: planners!.id },
    ]);
    const [managerSession, plannerSession] = await seedSessions(db, [
      makeSession({ userId: manager!.id }),
      makeSession({ userId: planner!.id }),
    ]);
    const [platform] = await seedTeams(db, [makeTeam({ name: 'Platform' })]);
    return {
      manager: { ...manager!, token: managerSession!.token },
      planner: { ...planner!, token: plannerSession!.token },
      joinerLogin: joinerLogin!,
      otherLogin: otherLogin!,
      platform: platform!,
    };
  });

/** Every employee record row, for «nothing changed» comparisons. */
const records = () =>
  withDb(async (db) => {
    const result = await db.execute('SELECT * FROM org.employee_records ORDER BY id');
    return result.rows;
  });

/** A joiner as in AC-19a: team, 40 h, Monday–Friday, start date, login linked. */
const joiner = (userId: string, teamId: string) => ({
  fullName: 'Test User 1',
  userId,
  teamId,
  contractMinutes: 2400,
  workingDays: [1, 2, 3, 4, 5],
  employmentStart: '2026-11-02',
  employmentEnd: null,
});

describe('createEmployeeRecord (AC-19a, AC-20)', () => {
  it('201 with the record, its team and who created it', async () => {
    const { manager, joinerLogin, platform } = await setup();

    const res = await call('/org/employee-records', {
      method: 'POST',
      token: manager.token,
      body: joiner(joinerLogin.id, platform.id),
    });

    expect(res.status).toBe(201);
    const record = await recordOf(res);
    expect(record).toMatchObject({
      fullName: 'Test User 1',
      userId: joinerLogin.id,
      team: { id: platform.id, name: 'Platform' },
      contractMinutes: 2400,
      workingDays: [1, 2, 3, 4, 5],
      employmentStart: '2026-11-02',
      employmentEnd: null,
      incomplete: false,
      version: 1,
      lastChangedBy: { id: manager.id, name: 'Test User 2' },
    });

    const fetched = await call(`/org/employee-records/${record.id}`, { token: manager.token });
    expect(fetched.status).toBe(200);
    expect(await recordOf(fetched)).toEqual(record);
  });

  it('saves a name-only record as incomplete, working Monday–Friday (AC-06)', async () => {
    const { manager } = await setup();
    const res = await call('/org/employee-records', {
      method: 'POST',
      token: manager.token,
      body: { fullName: 'Test User 3' },
    });
    expect(res.status).toBe(201);
    expect(await recordOf(res)).toMatchObject({
      incomplete: true,
      workingDays: [1, 2, 3, 4, 5],
      team: null,
      userId: null,
    });
  });

  it.each([
    ['0 hours', 0],
    ['above 60 hours', 3601],
  ])('400 naming the hours rule for %s, nothing saved', async (_, contractMinutes) => {
    const { manager, joinerLogin, platform } = await setup();

    const res = await call('/org/employee-records', {
      method: 'POST',
      token: manager.token,
      body: { ...joiner(joinerLogin.id, platform.id), contractMinutes },
    });

    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error).toMatchObject({
      _tag: 'ValidationError',
      code: 'platform.validation_failed',
      details: {
        issues: [
          {
            path: 'contractMinutes',
            message: 'Contract hours must be above 0 and at most 60 a week, in whole minutes',
          },
        ],
      },
    });
    expect(await records()).toEqual([]);
  });

  it('400 org.invalid_employee_record when the end is before the start', async () => {
    const { manager } = await setup();
    const res = await call('/org/employee-records', {
      method: 'POST',
      token: manager.token,
      body: { fullName: 'Test User 3', employmentStart: '2026-11-02', employmentEnd: '2026-11-01' },
    });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toEqual({
      _tag: 'ValidationError',
      code: 'org.invalid_employee_record',
      message: 'The end date is before the start date',
      details: { rules: ['end_before_start'] },
    });
  });

  it('409 naming the linked record when the login already has one (AC-19b)', async () => {
    const { manager, joinerLogin, platform } = await setup();
    const [holder] = await withDb((db) =>
      seedEmployeeRecords(db, [
        makeEmployeeRecord({
          fullName: 'Test User 3',
          userId: joinerLogin.id,
          teamId: platform.id,
          lastChangedBy: manager.id,
        }),
      ]),
    );
    const before = await records();

    const res = await call('/org/employee-records', {
      method: 'POST',
      token: manager.token,
      body: { fullName: 'Test User 1', userId: joinerLogin.id },
    });

    expect(res.status).toBe(409);
    expect(await errorOf(res)).toEqual({
      _tag: 'Conflict',
      code: 'org.login_already_linked',
      message: 'This login is already linked to Test User 3',
      details: {
        employeeRecord: {
          id: holder!.id,
          fullName: 'Test User 3',
          team: { id: platform.id, name: 'Platform' },
        },
      },
    });
    expect(await records()).toEqual(before);
  });

  it('404 org.user_not_found for a login that does not exist', async () => {
    const { manager } = await setup();
    const res = await call('/org/employee-records', {
      method: 'POST',
      token: manager.token,
      body: { fullName: 'Test User 1', userId: UNKNOWN_ID },
    });
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toEqual({
      _tag: 'NotFound',
      code: 'org.user_not_found',
      message: `Login ${UNKNOWN_ID} not found`,
    });
  });
});

describe('updateEmployeeRecord (AC-19, AC-19a, AC-20)', () => {
  const seedOne = (lastChangedBy: string, overrides = {}) =>
    withDb((db) =>
      seedEmployeeRecords(db, [
        makeEmployeeRecord({ fullName: 'Test User 1', lastChangedBy, ...overrides }),
      ]),
    ).then(([row]) => row!);

  it('saves 24 h over Monday–Wednesday, keeping fields left out, and links a login', async () => {
    const { manager, joinerLogin } = await setup();
    const row = await seedOne(manager.id, { employmentEnd: '2027-03-31' });

    const res = await call(`/org/employee-records/${row.id}`, {
      method: 'PATCH',
      token: manager.token,
      body: { version: 1, contractMinutes: 1440, workingDays: [3, 1, 2], userId: joinerLogin.id },
    });

    expect(res.status).toBe(200);
    expect(await recordOf(res)).toMatchObject({
      contractMinutes: 1440,
      workingDays: [1, 2, 3],
      userId: joinerLogin.id,
      employmentStart: '2026-01-05',
      employmentEnd: '2027-03-31',
      version: 2,
    });
  });

  it('400 when an end date lands before the stored start', async () => {
    const { manager } = await setup();
    const row = await seedOne(manager.id);
    const res = await call(`/org/employee-records/${row.id}`, {
      method: 'PATCH',
      token: manager.token,
      body: { version: 1, employmentEnd: '2025-12-31' },
    });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('org.invalid_employee_record');
  });

  it('409 org.version_conflict with the current values and who changed them', async () => {
    const { manager } = await setup();
    const row = await seedOne(manager.id, { version: 3, contractMinutes: 1920 });

    const res = await call(`/org/employee-records/${row.id}`, {
      method: 'PATCH',
      token: manager.token,
      body: { version: 2, contractMinutes: 1440 },
    });

    expect(res.status).toBe(409);
    const error = await errorOf(res);
    expect(error).toMatchObject({
      _tag: 'Conflict',
      code: 'org.version_conflict',
      message: 'Test User 2 changed this record meanwhile',
    });
    expect((error.details as { current: RecordBody }).current).toMatchObject({
      id: row.id,
      version: 3,
      contractMinutes: 1920,
    });
  });

  it('404 for a record that does not exist', async () => {
    const { manager } = await setup();
    const res = await call(`/org/employee-records/${UNKNOWN_ID}`, {
      method: 'PATCH',
      token: manager.token,
      body: { version: 1, contractMinutes: 1440 },
    });
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe('org.employee_record_not_found');
  });

  it('400 platform.validation_failed for a body without a version or with unknown fields', async () => {
    const { manager } = await setup();
    const row = await seedOne(manager.id);
    for (const body of [{ contractMinutes: 1440 }, { version: 1, contractHours: 24 }]) {
      const res = await call(`/org/employee-records/${row.id}`, {
        method: 'PATCH',
        token: manager.token,
        body,
      });
      expect(res.status).toBe(400);
      expect((await errorOf(res)).code).toBe('platform.validation_failed');
    }
  });
});

describe('listEmployeeRecords', () => {
  it('pages in id order with cursors', async () => {
    const { manager } = await setup();
    const rows = await withDb((db) =>
      seedEmployeeRecords(db, [
        makeEmployeeRecord({ lastChangedBy: manager.id }),
        makeEmployeeRecord({ lastChangedBy: manager.id }),
        makeEmployeeRecord({ lastChangedBy: manager.id }),
      ]),
    );
    const ids = rows.map((r) => r.id).sort();

    const first = await call('/org/employee-records?limit=2', { token: manager.token });
    expect(first.status).toBe(200);
    const page = await pageOf(first);
    expect(page.items.map((r) => r.id)).toEqual(ids.slice(0, 2));
    expect(page).toMatchObject({ hasNext: true, hasPrev: false, nextCursor: ids[1] });

    const next = await call(`/org/employee-records?after=${ids[1]}`, { token: manager.token });
    const rest = await pageOf(next);
    expect(rest.items.map((r) => r.id)).toEqual(ids.slice(2));
    expect(rest).toMatchObject({ hasNext: false, hasPrev: true, nextCursor: null });
  });
});

describe('without org:manage-employee-records (AC-22)', () => {
  const operations = (id: string, login: string): Array<[string, string, Call]> => [
    ['listEmployeeRecords', '/org/employee-records', {}],
    [
      'createEmployeeRecord',
      '/org/employee-records',
      { method: 'POST', body: { fullName: 'Mallory', userId: login } },
    ],
    ['getEmployeeRecord', `/org/employee-records/${id}`, {}],
    [
      'updateEmployeeRecord',
      `/org/employee-records/${id}`,
      { method: 'PATCH', body: { version: 1, contractMinutes: 60 } },
    ],
  ];

  it('403 org.missing_permission on every operation, nothing changed', async () => {
    const { manager, planner, joinerLogin } = await setup();
    const [row] = await withDb((db) =>
      seedEmployeeRecords(db, [makeEmployeeRecord({ lastChangedBy: manager.id })]),
    );
    const before = await records();

    for (const [, path, init] of operations(row!.id, joinerLogin.id)) {
      const res = await call(path, { ...init, token: planner.token });
      expect(res.status).toBe(403);
      expect(await errorOf(res)).toMatchObject({
        _tag: 'Forbidden',
        code: 'org.missing_permission',
        details: { missingPermissions: [MANAGE_EMPLOYEE_RECORDS] },
      });
    }
    expect(await records()).toEqual(before);
  });

  it('401 without a session', async () => {
    for (const [, path, init] of operations(UNKNOWN_ID, UNKNOWN_ID)) {
      const res = await call(path, init);
      expect(res.status).toBe(401);
    }
  });
});
