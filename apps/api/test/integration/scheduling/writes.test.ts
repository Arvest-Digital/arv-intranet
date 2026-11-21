import { env } from 'cloudflare:test';
import {
  Allocation,
  AllocationConflictDetails,
  AllocationImpact,
  AllocationRemoval,
  AllocationRuleViolations,
} from '@arv/contracts/scheduling';
import { ApiErrorBody } from '@arv/contracts/shared';
import {
  makeAccessRole,
  makeAllocation,
  makeEmployeeRecord,
  makeProject,
  makeSession,
  makeUser,
  seedAccessRoles,
  seedAllocations,
  seedEmployeeRecords,
  seedProjects,
  seedSessions,
  seedUserAccessRoles,
  seedUsers,
} from '@arv/db/testing';
import { calendarDateIn } from '@arv/kernel';
import { Schema } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, resetDb, withDb } from '../../helpers';

/**
 * T29 — scheduling write endpoints (openapi.yaml `createAllocation`, `updateAllocation`,
 * `removeAllocation`, `bookLeave`; AC-07, AC-07a, AC-07b, AC-09–AC-13, AC-15; ADR-0010) through the
 * real Worker. Every 2xx body is decoded with its contract schema, every error with `ApiErrorBody`
 * and its `details` with the schema its `code` names.
 */

beforeEach(resetDb);

const UNKNOWN_ID = '01933b8e-0000-7000-8000-00000000ffff';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today and its neighbours in the Worker's company time zone (wrangler `COMPANY_TIME_ZONE`). */
const day = (offset: number) => calendarDateIn(env.COMPANY_TIME_ZONE)(Date.now() + offset * DAY_MS);

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** The Monday of the ISO week of `date`. */
const mondayOf = (date: string) => {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
};

/** A Monday two weeks ahead: whole future weeks keep the weekly figures exact. */
const MONDAY = addDays(mondayOf(day(0)), 14);

const send = (method: string, path: string, token: string, json?: unknown) =>
  api(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(json === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });

const body = async <S extends Schema.Schema.AnyNoContext>(
  schema: S,
  res: Response,
): Promise<Schema.Schema.Type<S>> => Schema.decodeUnknownSync(schema)(await res.json());

const errorOf = async (res: Response) => (await body(ApiErrorBody, res)).error;

const detailsOf = <S extends Schema.Schema.AnyNoContext>(
  schema: S,
  error: { readonly details?: unknown },
): Schema.Schema.Type<S> => Schema.decodeUnknownSync(schema)(error.details);

/**
 * Users: a planner (edit-allocations), a board viewer (no edit) and a planner who may also see
 * leave reasons. Ann works Monday to Friday, 40 h a week, with no end; Bob's employment ends in
 * 40 days. Atlas and Beacon are open client projects, Gone closed yesterday, Short closes in 30
 * days, Sick leave is a leave-type project.
 */
const setup = () =>
  withDb(async (db) => {
    const users = await seedUsers(db, [
      makeUser({ name: 'Test Planner' }),
      makeUser({ name: 'Test Viewer' }),
      makeUser({ name: 'Test Reasons Planner' }),
    ]);
    const [planner, viewer, reasonsPlanner] = users.map((u) => u!);
    const [planners, viewers, reasons] = await seedAccessRoles(db, [
      makeAccessRole({ name: 'Planners', permissionKeys: ['scheduling:edit-allocations'] }),
      makeAccessRole({ name: 'Board viewers', permissionKeys: ['scheduling:view-whole-board'] }),
      makeAccessRole({
        name: 'Leave planners',
        permissionKeys: ['scheduling:edit-allocations', 'scheduling:see-leave-reasons'],
      }),
    ]);
    await seedUserAccessRoles(db, [
      { userId: planner!.id, accessRoleId: planners!.id },
      { userId: viewer!.id, accessRoleId: viewers!.id },
      { userId: reasonsPlanner!.id, accessRoleId: reasons!.id },
    ]);
    const sessions = await seedSessions(
      db,
      users.map((u) => makeSession({ userId: u!.id })),
    );
    const [plannerToken = '', viewerToken = '', reasonsToken = ''] = sessions.map((s) => s!.token);

    const [ann, bob] = await seedEmployeeRecords(db, [
      makeEmployeeRecord({
        fullName: 'Ann Resource',
        employmentStart: day(-400),
        lastChangedBy: planner!.id,
      }),
      makeEmployeeRecord({
        fullName: 'Bob Resource',
        employmentStart: day(-400),
        employmentEnd: day(40),
        lastChangedBy: planner!.id,
      }),
    ]);
    const [atlas, beacon, gone, short, sick] = await seedProjects(db, [
      makeProject({ name: 'Atlas' }),
      makeProject({ name: 'Beacon' }),
      makeProject({ name: 'Gone', closeDate: day(-1) }),
      makeProject({ name: 'Short', closeDate: day(30) }),
      makeProject({ name: 'Sick leave', type: 'leave' }),
    ]);
    return {
      plannerToken,
      viewerToken,
      reasonsToken,
      planner: planner!,
      ann: ann!,
      bob: bob!,
      atlas: atlas!,
      beacon: beacon!,
      gone: gone!,
      short: short!,
      sick: sick!,
    };
  });

type Setup = Awaited<ReturnType<typeof setup>>;

/** Ann on Atlas, 20 h a week, for four whole weeks from `MONDAY`. */
const annOnAtlas = (s: Setup, overrides: Record<string, unknown> = {}) => ({
  employeeId: s.ann.id,
  projectId: s.atlas.id,
  startsOn: MONDAY,
  endsOn: addDays(MONDAY, 27),
  rateMinutes: 1200,
  ratePeriod: 'week',
  ...overrides,
});

const seedAnn = (s: Setup, projectId: string, startsOn: string, endsOn: string, rate = 1200) =>
  withDb(async (db) => {
    const [allocation] = await seedAllocations(db, [
      makeAllocation({
        employeeId: s.ann.id,
        projectId,
        segments: [{ startsOn, endsOn, rateMinutes: rate, ratePeriod: 'week' }],
        lastChangedBy: s.planner.id,
      }),
    ]);
    return allocation!;
  });

describe('POST /scheduling/allocations (AC-07, AC-09, AC-10, AC-11, AC-12, AC-13)', () => {
  it('answers 201 with the allocation at version 1, stamped by the planner (AC-07)', async () => {
    const s = await setup();
    const res = await send('POST', '/scheduling/allocations', s.plannerToken, annOnAtlas(s));
    expect(res.status).toBe(201);
    const created = await body(Allocation, res);
    expect(created).toMatchObject({
      employee: { id: s.ann.id, fullName: 'Ann Resource', team: null },
      project: { id: s.atlas.id, name: 'Atlas', type: 'client' },
      away: false,
      segments: [
        { startsOn: MONDAY, endsOn: addDays(MONDAY, 27), rateMinutes: 1200, ratePeriod: 'week' },
      ],
      version: 1,
      lastChangedBy: { id: s.planner.id, name: 'Test Planner' },
    });

    const read = await send('GET', `/scheduling/allocations/${created.id}`, s.plannerToken);
    expect(read.status).toBe(200);
    expect((await body(Allocation, read)).version).toBe(1);
  });

  it('asks to confirm an overbooking, then saves it re-sent with confirm (AC-10)', async () => {
    const s = await setup();
    await seedAnn(s, s.beacon.id, MONDAY, addDays(MONDAY, 27), 2400);

    const first = await send('POST', '/scheduling/allocations', s.plannerToken, annOnAtlas(s));
    expect(first.status).toBe(409);
    const error = await errorOf(first);
    expect(error).toMatchObject({
      _tag: 'ConfirmationRequired',
      code: 'scheduling.overbooking_confirmation_required',
      message: 'The resource will be overbooked in 4 weeks',
    });
    const impact = detailsOf(AllocationImpact, error);
    expect(impact.workOnLeaveDays).toEqual([]);
    expect(impact.overbookedWeeks).toEqual(
      [0, 7, 14, 21].map((offset) => ({
        weekStart: addDays(MONDAY, offset),
        capacityMinutes: 2400,
        allocatedMinutes: 3600,
        overMinutes: 1200,
      })),
    );

    const confirmed = await send(
      'POST',
      '/scheduling/allocations',
      s.plannerToken,
      annOnAtlas(s, { confirm: true }),
    );
    expect(confirmed.status).toBe(201);
    expect((await body(Allocation, confirmed)).version).toBe(1);
  });

  it('names a new allocation on leave days with a null id (AC-15)', async () => {
    const s = await setup();
    await withDb((db) =>
      seedAllocations(db, [
        makeAllocation({
          employeeId: s.ann.id,
          projectId: s.sick.id,
          segments: [
            { startsOn: MONDAY, endsOn: MONDAY, rateMinutes: null, ratePeriod: 'full-day' },
          ],
          lastChangedBy: s.planner.id,
        }),
      ]),
    );
    const res = await send('POST', '/scheduling/allocations', s.plannerToken, annOnAtlas(s));
    expect(res.status).toBe(409);
    const impact = detailsOf(AllocationImpact, await errorOf(res));
    expect(impact.workOnLeaveDays).toEqual([
      {
        allocationId: null,
        project: { id: s.atlas.id, name: 'Atlas', type: 'client' },
        days: [MONDAY],
      },
    ]);
  });

  it('refuses a closed project with 409 scheduling.project_closed (AC-11)', async () => {
    const s = await setup();
    const res = await send(
      'POST',
      '/scheduling/allocations',
      s.plannerToken,
      annOnAtlas(s, { projectId: s.gone.id }),
    );
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toEqual({
      _tag: 'Conflict',
      code: 'scheduling.project_closed',
      message: 'The project is closed and accepts no new, changed or removed allocations',
    });
  });

  it('refuses running past the project close date with 400 (AC-25)', async () => {
    const s = await setup();
    const res = await send(
      'POST',
      '/scheduling/allocations',
      s.plannerToken,
      annOnAtlas(s, { projectId: s.short.id, endsOn: day(60) }),
    );
    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error).toMatchObject({
      _tag: 'ValidationError',
      code: 'scheduling.past_project_close_date',
    });
    expect(detailsOf(AllocationRuleViolations, error).rules).toContain('past_project_close_date');
  });

  it('refuses outside the employment period, naming the last date (AC-13)', async () => {
    const s = await setup();
    const res = await send(
      'POST',
      '/scheduling/allocations',
      s.plannerToken,
      annOnAtlas(s, { employeeId: s.bob.id, endsOn: day(60) }),
    );
    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error).toMatchObject({
      _tag: 'ValidationError',
      code: 'scheduling.outside_employment_period',
      message: `The allocation falls outside the resource's employment period; the last date they can be allocated is ${day(40)}`,
    });
    expect(detailsOf(AllocationRuleViolations, error)).toEqual({
      rules: ['outside_employment_period'],
      lastBookableDate: day(40),
    });
  });

  it('refuses broken rules with 400 and every rule named (AC-09, AC-09b)', async () => {
    const s = await setup();
    const backwards = await send(
      'POST',
      '/scheduling/allocations',
      s.plannerToken,
      annOnAtlas(s, { endsOn: addDays(MONDAY, -1) }),
    );
    expect(backwards.status).toBe(400);
    const invalid = await errorOf(backwards);
    expect(invalid).toMatchObject({
      code: 'scheduling.invalid_allocation',
      message: 'The end date is before the start date',
    });
    expect(detailsOf(AllocationRuleViolations, invalid).rules).toContain('end_before_start');

    const past = await send(
      'POST',
      '/scheduling/allocations',
      s.plannerToken,
      annOnAtlas(s, { startsOn: day(-3) }),
    );
    expect(past.status).toBe(400);
    const pastError = await errorOf(past);
    expect(pastError.code).toBe('scheduling.past_not_rewritable');
    expect(detailsOf(AllocationRuleViolations, pastError).rules).toContain('starts_before_today');

    const tooMuch = await send(
      'POST',
      '/scheduling/allocations',
      s.plannerToken,
      annOnAtlas(s, { rateMinutes: 1500, ratePeriod: 'day' }),
    );
    expect(tooMuch.status).toBe(400);
    expect((await errorOf(tooMuch)).code).toBe('scheduling.invalid_allocation');
  });

  it('refuses a body the schema rejects with 400 platform.validation_failed', async () => {
    const s = await setup();
    const res = await send(
      'POST',
      '/scheduling/allocations',
      s.plannerToken,
      annOnAtlas(s, { rateMinutes: 1201 }),
    );
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('platform.validation_failed');
  });

  it('answers 404 for an unknown project or resource', async () => {
    const s = await setup();
    const project = await send(
      'POST',
      '/scheduling/allocations',
      s.plannerToken,
      annOnAtlas(s, { projectId: UNKNOWN_ID }),
    );
    expect(project.status).toBe(404);
    expect(await errorOf(project)).toEqual({
      _tag: 'NotFound',
      code: 'scheduling.project_not_found',
      message: `Project ${UNKNOWN_ID} not found`,
    });

    const employee = await send(
      'POST',
      '/scheduling/allocations',
      s.plannerToken,
      annOnAtlas(s, { employeeId: UNKNOWN_ID }),
    );
    expect(employee.status).toBe(404);
    expect((await errorOf(employee)).code).toBe('scheduling.employee_record_not_found');
  });

  it('answers 403 naming edit-allocations without it (AC-12, AC-14)', async () => {
    const s = await setup();
    const res = await send('POST', '/scheduling/allocations', s.viewerToken, annOnAtlas(s));
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toMatchObject({
      _tag: 'Forbidden',
      code: 'scheduling.missing_permission',
      details: { missingPermissions: ['scheduling:edit-allocations'] },
    });
  });

  it('answers 401 without a session', async () => {
    const res = await api('/scheduling/allocations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /scheduling/allocations/:id (AC-07b, AC-09b, AC-10)', () => {
  it('saves a change from today and bumps the version', async () => {
    const s = await setup();
    const seeded = await seedAnn(s, s.atlas.id, MONDAY, addDays(MONDAY, 27));
    const res = await send('PATCH', `/scheduling/allocations/${seeded.id}`, s.plannerToken, {
      version: 1,
      rateMinutes: 600,
    });
    expect(res.status).toBe(200);
    const saved = await body(Allocation, res);
    expect(saved.version).toBe(2);
    expect(saved.segments).toEqual([
      { startsOn: MONDAY, endsOn: addDays(MONDAY, 27), rateMinutes: 600, ratePeriod: 'week' },
    ]);
  });

  it('answers a stale version with 409 and the current values, who changed them (AC-07b)', async () => {
    const s = await setup();
    const seeded = await seedAnn(s, s.atlas.id, MONDAY, addDays(MONDAY, 27));
    const path = `/scheduling/allocations/${seeded.id}`;
    expect(
      (await send('PATCH', path, s.plannerToken, { version: 1, rateMinutes: 960 })).status,
    ).toBe(200);

    const stale = await send('PATCH', path, s.plannerToken, { version: 1, rateMinutes: 600 });
    expect(stale.status).toBe(409);
    const error = await errorOf(stale);
    expect(error).toMatchObject({
      _tag: 'Conflict',
      code: 'scheduling.version_conflict',
      message: 'Test Planner changed this allocation meanwhile',
    });
    const { current } = detailsOf(AllocationConflictDetails, error);
    expect(current).toMatchObject({
      id: seeded.id,
      version: 2,
      lastChangedBy: { id: s.planner.id, name: 'Test Planner' },
    });
    expect(current.segments[0]?.rateMinutes).toBe(960);
  });

  it('asks to confirm hours that grow into an overbooked week (AC-10)', async () => {
    const s = await setup();
    await seedAnn(s, s.beacon.id, MONDAY, addDays(MONDAY, 6), 2400);
    const seeded = await seedAnn(s, s.atlas.id, addDays(MONDAY, 7), addDays(MONDAY, 13));
    const path = `/scheduling/allocations/${seeded.id}`;
    const change = { version: 1, startsOn: MONDAY };
    const first = await send('PATCH', path, s.plannerToken, change);
    expect(first.status).toBe(409);
    expect((await errorOf(first)).code).toBe('scheduling.overbooking_confirmation_required');

    const confirmed = await send('PATCH', path, s.plannerToken, { ...change, confirm: true });
    expect(confirmed.status).toBe(200);
    expect((await body(Allocation, confirmed)).segments[0]?.startsOn).toBe(MONDAY);
  });

  it('refuses a closed project with 409 (AC-11)', async () => {
    const s = await setup();
    const seeded = await seedAnn(s, s.gone.id, day(-20), day(-2));
    const res = await send('PATCH', `/scheduling/allocations/${seeded.id}`, s.plannerToken, {
      version: 1,
      rateMinutes: 600,
    });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe('scheduling.project_closed');
  });

  it('answers 404 for an unknown allocation and 403 without edit-allocations', async () => {
    const s = await setup();
    const missing = await send('PATCH', `/scheduling/allocations/${UNKNOWN_ID}`, s.plannerToken, {
      version: 1,
    });
    expect(missing.status).toBe(404);
    expect((await errorOf(missing)).code).toBe('scheduling.allocation_not_found');

    const seeded = await seedAnn(s, s.atlas.id, MONDAY, addDays(MONDAY, 27));
    const forbidden = await send('PATCH', `/scheduling/allocations/${seeded.id}`, s.viewerToken, {
      version: 1,
      rateMinutes: 600,
    });
    expect(forbidden.status).toBe(403);
    expect((await errorOf(forbidden)).code).toBe('scheduling.missing_permission');
  });

  it('refuses a body without a version with 400', async () => {
    const s = await setup();
    const seeded = await seedAnn(s, s.atlas.id, MONDAY, addDays(MONDAY, 27));
    const res = await send('PATCH', `/scheduling/allocations/${seeded.id}`, s.plannerToken, {
      rateMinutes: 600,
    });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('platform.validation_failed');
  });
});

describe('DELETE /scheduling/allocations/:id (AC-07a, AC-07b)', () => {
  it('ends a started allocation yesterday', async () => {
    const s = await setup();
    const seeded = await seedAnn(s, s.atlas.id, day(-10), day(30));
    const res = await send(
      'DELETE',
      `/scheduling/allocations/${seeded.id}?version=1`,
      s.plannerToken,
    );
    expect(res.status).toBe(200);
    expect(await body(AllocationRemoval, res)).toEqual({
      allocationId: seeded.id,
      outcome: 'ended',
      endsOn: day(-1),
    });
  });

  it('deletes one that has not started; the history keeps the removal', async () => {
    const s = await setup();
    const seeded = await seedAnn(s, s.atlas.id, MONDAY, addDays(MONDAY, 27));
    const res = await send(
      'DELETE',
      `/scheduling/allocations/${seeded.id}?version=1`,
      s.plannerToken,
    );
    expect(res.status).toBe(200);
    expect(await body(AllocationRemoval, res)).toEqual({
      allocationId: seeded.id,
      outcome: 'deleted',
      endsOn: null,
    });
    const gone = await send('GET', `/scheduling/allocations/${seeded.id}`, s.plannerToken);
    expect(gone.status).toBe(404);
    const history = await send(
      'GET',
      `/scheduling/allocations/${seeded.id}/history`,
      s.plannerToken,
    );
    const entries = ((await history.json()) as { items: { changeKind: string }[] }).items;
    expect(entries.map((e) => e.changeKind)).toContain('removed');
  });

  it('answers a stale version with 409 and the current values (AC-07b)', async () => {
    const s = await setup();
    const seeded = await seedAnn(s, s.atlas.id, MONDAY, addDays(MONDAY, 27));
    await send('PATCH', `/scheduling/allocations/${seeded.id}`, s.plannerToken, {
      version: 1,
      rateMinutes: 600,
    });
    const res = await send(
      'DELETE',
      `/scheduling/allocations/${seeded.id}?version=1`,
      s.plannerToken,
    );
    expect(res.status).toBe(409);
    const error = await errorOf(res);
    expect(error.code).toBe('scheduling.version_conflict');
    expect(detailsOf(AllocationConflictDetails, error).current.version).toBe(2);
  });

  it('refuses a closed project with 409, a missing version with 400, a viewer with 403', async () => {
    const s = await setup();
    const closed = await seedAnn(s, s.gone.id, day(-20), day(-2));
    const res = await send(
      'DELETE',
      `/scheduling/allocations/${closed.id}?version=1`,
      s.plannerToken,
    );
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe('scheduling.project_closed');

    const open = await seedAnn(s, s.atlas.id, MONDAY, addDays(MONDAY, 27));
    const noVersion = await send('DELETE', `/scheduling/allocations/${open.id}`, s.plannerToken);
    expect(noVersion.status).toBe(400);
    expect((await errorOf(noVersion)).code).toBe('platform.validation_failed');

    const forbidden = await send(
      'DELETE',
      `/scheduling/allocations/${open.id}?version=1`,
      s.viewerToken,
    );
    expect(forbidden.status).toBe(403);
  });
});

describe('POST /scheduling/leave (AC-15, AC-29)', () => {
  const leaveWeek = (s: Setup, overrides: Record<string, unknown> = {}) => ({
    employeeId: s.ann.id,
    projectId: s.sick.id,
    startsOn: MONDAY,
    endsOn: addDays(MONDAY, 4),
    ...overrides,
  });

  it('names the work on the leave days, then books it confirmed, redacted for the booker', async () => {
    const s = await setup();
    const work = await seedAnn(s, s.atlas.id, MONDAY, addDays(MONDAY, 27));

    const first = await send('POST', '/scheduling/leave', s.plannerToken, leaveWeek(s));
    expect(first.status).toBe(409);
    const error = await errorOf(first);
    expect(error).toMatchObject({
      _tag: 'ConfirmationRequired',
      code: 'scheduling.overbooking_confirmation_required',
    });
    expect(error.message).toContain('1 work allocation falls on the leave days');
    expect(detailsOf(AllocationImpact, error).workOnLeaveDays).toEqual([
      {
        allocationId: work.id,
        project: { id: s.atlas.id, name: 'Atlas', type: 'client' },
        days: [0, 1, 2, 3, 4].map((d) => addDays(MONDAY, d)),
      },
    ]);

    const booked = await send(
      'POST',
      '/scheduling/leave',
      s.plannerToken,
      leaveWeek(s, { confirm: true }),
    );
    expect(booked.status).toBe(201);
    expect(await body(Allocation, booked)).toMatchObject({
      project: null,
      away: true,
      segments: [
        { startsOn: MONDAY, endsOn: addDays(MONDAY, 4), rateMinutes: null, ratePeriod: 'full-day' },
      ],
      version: 1,
    });
  });

  it('shows the leave type to a booker who may see leave reasons (AC-29)', async () => {
    const s = await setup();
    const res = await send('POST', '/scheduling/leave', s.reasonsToken, leaveWeek(s));
    expect(res.status).toBe(201);
    expect((await body(Allocation, res)).project).toEqual({
      id: s.sick.id,
      name: 'Sick leave',
      type: 'leave',
    });
  });

  it('refuses a project that is not leave with 400 scheduling.not_a_leave_project', async () => {
    const s = await setup();
    const res = await send(
      'POST',
      '/scheduling/leave',
      s.plannerToken,
      leaveWeek(s, { projectId: s.atlas.id }),
    );
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toEqual({
      _tag: 'ValidationError',
      code: 'scheduling.not_a_leave_project',
      message: 'Leave can only be booked on a leave-type project',
      details: { rules: ['not_a_leave_project'] },
    });
  });

  it('answers 403 without edit-allocations and 400 for a rate in the body', async () => {
    const s = await setup();
    expect((await send('POST', '/scheduling/leave', s.viewerToken, leaveWeek(s))).status).toBe(403);
    const extra = await send(
      'POST',
      '/scheduling/leave',
      s.plannerToken,
      leaveWeek(s, { rateMinutes: 480 }),
    );
    expect(extra.status).toBe(400);
  });
});
