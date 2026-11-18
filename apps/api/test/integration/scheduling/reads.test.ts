import { env } from 'cloudflare:test';
import {
  Allocation,
  AllocationHistoryPage,
  Board,
  FreeList,
  MySchedule,
} from '@arv/contracts/scheduling';
import { ApiErrorBody } from '@arv/contracts/shared';
import {
  makeAccessRole,
  makeAllocation,
  makeEmployeeRecord,
  makeHistoryEntry,
  makeProject,
  makeSession,
  makeTeam,
  makeUser,
  seedAccessRoles,
  seedAllocationHistory,
  seedAllocations,
  seedEmployeeRecords,
  seedProjects,
  seedSessions,
  seedTeams,
  seedUserAccessRoles,
  seedUsers,
} from '@arv/db/testing';
import { calendarDateIn } from '@arv/kernel';
import { Schema } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, resetDb, withDb } from '../../helpers';

/**
 * T28 — scheduling read endpoints (openapi.yaml `getBoard`, `getFreeList`, `getMySchedule`,
 * `getAllocation`, `listAllocationHistory`; AC-01–AC-05, AC-16–AC-18, AC-29) through the real
 * Worker. Every 200 body is decoded with its contract schema, every error with `ApiErrorBody`.
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

const call = (path: string, token?: string) =>
  api(path, { headers: token === undefined ? {} : { authorization: `Bearer ${token}` } });

const body = async <S extends Schema.Schema.AnyNoContext>(
  schema: S,
  res: Response,
): Promise<Schema.Schema.Type<S>> => Schema.decodeUnknownSync(schema)(await res.json());

const errorOf = async (res: Response) => (await body(ApiErrorBody, res)).error;

/**
 * Users: a board viewer, a planner (who changed every allocation), a leave-reasons viewer, a plain
 * user linked to Test resource «Ann», and a plain user linked to nothing. Ann (team Platform) works
 * 20 h a week on Atlas around today and has a week of sick leave in three weeks; Bob's employment
 * ends in 40 days, and his Atlas allocation runs past it.
 */
const setup = () =>
  withDb(async (db) => {
    const users = await seedUsers(db, [
      makeUser(),
      makeUser({ name: 'Test Planner' }),
      makeUser(),
      makeUser(),
      makeUser(),
    ]);
    const [viewer, planner, reasonsViewer, linked] = users.map((u) => u!);
    const [viewers, planners, reasons] = await seedAccessRoles(db, [
      makeAccessRole({ name: 'Board viewers', permissionKeys: ['scheduling:view-whole-board'] }),
      makeAccessRole({ name: 'Planners', permissionKeys: ['scheduling:edit-allocations'] }),
      makeAccessRole({
        name: 'Leave readers',
        permissionKeys: ['scheduling:view-whole-board', 'scheduling:see-leave-reasons'],
      }),
    ]);
    await seedUserAccessRoles(db, [
      { userId: viewer!.id, accessRoleId: viewers!.id },
      { userId: planner!.id, accessRoleId: planners!.id },
      { userId: reasonsViewer!.id, accessRoleId: reasons!.id },
    ]);
    const sessions = await seedSessions(
      db,
      users.map((u) => makeSession({ userId: u!.id })),
    );
    const [token = '', plannerToken = '', reasonsToken = '', linkedToken = '', unlinkedToken = ''] =
      sessions.map((s) => s!.token);

    const [platform] = await seedTeams(db, [makeTeam({ name: 'Platform' })]);
    const [ann, bob] = await seedEmployeeRecords(db, [
      makeEmployeeRecord({
        fullName: 'Ann Resource',
        userId: linked!.id,
        teamId: platform!.id,
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
    const [atlas, sick] = await seedProjects(db, [
      makeProject({ name: 'Atlas' }),
      makeProject({ name: 'Sick leave', type: 'leave' }),
    ]);
    const work = { rateMinutes: 1200, ratePeriod: 'week' as const };
    const leaveMonday = addDays(mondayOf(day(0)), 21);
    const [annWork, annLeave, bobWork] = await seedAllocations(db, [
      makeAllocation({
        employeeId: ann!.id,
        projectId: atlas!.id,
        segments: [{ startsOn: day(-30), endsOn: day(120), ...work }],
        lastChangedBy: planner!.id,
      }),
      makeAllocation({
        employeeId: ann!.id,
        projectId: sick!.id,
        segments: [
          {
            startsOn: leaveMonday,
            endsOn: addDays(leaveMonday, 4),
            rateMinutes: null,
            ratePeriod: 'full-day',
          },
        ],
        lastChangedBy: planner!.id,
      }),
      makeAllocation({
        employeeId: bob!.id,
        projectId: atlas!.id,
        segments: [{ startsOn: day(-30), endsOn: day(120), ...work }],
        lastChangedBy: planner!.id,
      }),
    ]);
    return {
      token,
      plannerToken,
      reasonsToken,
      linkedToken,
      unlinkedToken,
      planner: planner!,
      platform: platform!,
      ann: ann!,
      bob: bob!,
      atlas: atlas!,
      sick: sick!,
      annWork: annWork!,
      annLeave: annLeave!,
      bobWork: bobWork!,
    };
  });

describe('GET /scheduling/board (AC-01, AC-02, AC-03)', () => {
  it('answers 200 with the default window: 12 weeks from the current week', async () => {
    const s = await setup();
    const res = await call('/scheduling/board', s.token);
    expect(res.status).toBe(200);
    const board = await body(Board, res);

    const monday = mondayOf(day(0));
    expect(board.from).toBe(monday);
    expect(board.to).toBe(addDays(monday, 7 * 12 - 1));
    expect(board.weeks).toHaveLength(12);
    expect(board.rows.map((row) => row.employee.fullName)).toEqual([
      'Ann Resource',
      'Bob Resource',
    ]);
    const annRow = board.rows[0]!;
    expect(annRow.employee.team).toEqual({ id: s.platform.id, name: 'Platform' });
    expect(annRow.cells).toHaveLength(12);
    const work = annRow.allocations.find((a) => a.id === s.annWork.id)!;
    expect(work.project).toEqual({ id: s.atlas.id, name: 'Atlas', type: 'client' });
    expect(work.lastChangedBy).toEqual({ id: s.planner.id, name: 'Test Planner' });
    expect(work.minutesPerWeek).toHaveLength(12);
  });

  it('redacts leave type and a hidden employment end for a board viewer (AC-22, AC-29)', async () => {
    const s = await setup();
    const board = await body(Board, await call('/scheduling/board', s.token));
    const leave = board.rows[0]!.allocations.find((a) => a.id === s.annLeave.id)!;
    expect(leave).toMatchObject({ project: null, away: true });
    const bobRow = board.rows[1]!;
    expect(bobRow.employmentEnd).toBeNull();
    expect(bobRow.allocations[0]!.needsAttention).toBeNull();
    expect(bobRow.allocations[0]!.segments[0]!.endsOn).toBe(day(40));
  });

  it('shows them to a planner and leave reasons to their holder', async () => {
    const s = await setup();
    const planned = await body(Board, await call('/scheduling/board', s.plannerToken));
    expect(planned.rows[1]!.employmentEnd).toBe(day(40));
    expect(planned.rows[1]!.allocations[0]!.needsAttention).toBe(true);

    const reasons = await body(Board, await call('/scheduling/board', s.reasonsToken));
    const leave = reasons.rows[0]!.allocations.find((a) => a.id === s.annLeave.id)!;
    expect(leave.project).toEqual({ id: s.sick.id, name: 'Sick leave', type: 'leave' });
  });

  it('narrows to a team (AC-02)', async () => {
    const s = await setup();
    const board = await body(
      Board,
      await call(`/scheduling/board?teamId=${s.platform.id}&weeks=4`, s.token),
    );
    expect(board.weeks).toHaveLength(4);
    expect(board.rows.map((row) => row.employee.id)).toEqual([s.ann.id]);
  });

  it('answers 400 window_out_of_range for a window past 52 weeks ahead', async () => {
    const s = await setup();
    const res = await call(`/scheduling/board?from=${day(7 * 52)}`, s.token);
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toEqual({
      _tag: 'ValidationError',
      code: 'scheduling.window_out_of_range',
      message: 'The board shows at most 12 months back and 52 weeks ahead',
      details: { rules: ['window_out_of_range'] },
    });
  });

  it('answers 400 window_out_of_range for a window more than 12 months back', async () => {
    const s = await setup();
    const res = await call(`/scheduling/board?from=${day(-400)}`, s.token);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('scheduling.window_out_of_range');
  });

  it('answers 400 validation_failed for more than 12 weeks', async () => {
    const s = await setup();
    const res = await call('/scheduling/board?weeks=13', s.token);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('platform.validation_failed');
  });

  it('answers 403 without view-whole-board or edit-allocations (AC-03)', async () => {
    const s = await setup();
    const res = await call('/scheduling/board', s.linkedToken);
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toMatchObject({
      _tag: 'Forbidden',
      code: 'scheduling.missing_permission',
      details: { missingPermissions: ['scheduling:view-whole-board'] },
    });
  });

  it('answers 401 without a session', async () => {
    const res = await call('/scheduling/board');
    expect(res.status).toBe(401);
  });
});

describe('GET /scheduling/free-list (AC-04, AC-05)', () => {
  it('answers 200 with the ranked list', async () => {
    const s = await setup();
    const res = await call('/scheduling/free-list?weeks=2&minFreeHours=0', s.token);
    expect(res.status).toBe(200);
    const list = await body(FreeList, res);
    expect(list.from).toBe(day(0));
    expect(list.weeks).toHaveLength(2);
    expect(list.items.map((item) => item.employee.id).sort()).toEqual([s.ann.id, s.bob.id].sort());
    expect(list.incompleteRecords).toEqual([]);
  });

  it.each([
    ['weeks above 12', 'weeks=13&minFreeHours=0', ['weeks']],
    ['weeks of 0', 'weeks=0&minFreeHours=0', ['weeks']],
    ['weeks not a number', 'weeks=two&minFreeHours=0', ['weeks']],
    ['negative free hours', 'weeks=2&minFreeHours=-1', ['minFreeHours']],
    ['both out of range', 'weeks=13&minFreeHours=-1', ['weeks', 'minFreeHours']],
  ])('answers 400 with the AC-05 message for %s', async (_, query, paths) => {
    const s = await setup();
    const res = await call(`/scheduling/free-list?${query}`, s.token);
    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error).toMatchObject({
      _tag: 'ValidationError',
      code: 'platform.validation_failed',
      message: 'The number of weeks must be from 1 to 12 and the free hours must be zero or more',
    });
    const issues = (error.details as { issues: Array<{ path: string }> }).issues;
    expect(issues.map((issue) => issue.path)).toEqual(paths);
  });

  it('answers 403 without permission', async () => {
    const s = await setup();
    const res = await call('/scheduling/free-list?weeks=2&minFreeHours=0', s.linkedToken);
    expect(res.status).toBe(403);
  });
});

describe('GET /scheduling/my-schedule (AC-17, AC-18)', () => {
  it('answers 200 with the own row, own leave type shown, without any board permission', async () => {
    const s = await setup();
    const res = await call('/scheduling/my-schedule', s.linkedToken);
    expect(res.status).toBe(200);
    const mine = await body(MySchedule, res);
    expect(mine.employee).toEqual({
      id: s.ann.id,
      fullName: 'Ann Resource',
      team: { id: s.platform.id, name: 'Platform' },
    });
    expect(mine.weeks).toHaveLength(12);
    const leave = mine.allocations.find((a) => a.id === s.annLeave.id)!;
    expect(leave.project).toEqual({ id: s.sick.id, name: 'Sick leave', type: 'leave' });
  });

  it('answers 404 not_a_resource for a login linked to no employee record (AC-18)', async () => {
    const s = await setup();
    const res = await call('/scheduling/my-schedule', s.unlinkedToken);
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toEqual({
      _tag: 'NotFound',
      code: 'scheduling.not_a_resource',
      message:
        'You are not set up as a resource yet; someone with the manage-employee-records permission can link you',
    });
  });

  it('answers 400 window_out_of_range like the board', async () => {
    const s = await setup();
    const res = await call(`/scheduling/my-schedule?from=${day(-400)}`, s.linkedToken);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('scheduling.window_out_of_range');
  });
});

describe('GET /scheduling/allocations/:allocationId (US-05)', () => {
  it('answers 200 with the version and who changed it last', async () => {
    const s = await setup();
    const res = await call(`/scheduling/allocations/${s.annWork.id}`, s.token);
    expect(res.status).toBe(200);
    const allocation = await body(Allocation, res);
    expect(allocation).toMatchObject({
      id: s.annWork.id,
      employee: { id: s.ann.id, fullName: 'Ann Resource', team: { name: 'Platform' } },
      project: { id: s.atlas.id, name: 'Atlas', type: 'client' },
      away: false,
      needsAttention: null,
      version: 1,
      lastChangedBy: { id: s.planner.id, name: 'Test Planner' },
    });
    expect(allocation.segments).toEqual([
      { startsOn: day(-30), endsOn: day(120), rateMinutes: 1200, ratePeriod: 'week' },
    ]);
  });

  it('redacts a leave type to «away» (AC-29)', async () => {
    const s = await setup();
    const allocation = await body(
      Allocation,
      await call(`/scheduling/allocations/${s.annLeave.id}`, s.token),
    );
    expect(allocation).toMatchObject({ project: null, away: true });
  });

  it('answers 404 allocation_not_found for an unknown id', async () => {
    const s = await setup();
    const res = await call(`/scheduling/allocations/${UNKNOWN_ID}`, s.token);
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toEqual({
      _tag: 'NotFound',
      code: 'scheduling.allocation_not_found',
      message: `Allocation ${UNKNOWN_ID} not found`,
    });
  });

  it('answers 400 for an id that is not a uuid, 403 without permission', async () => {
    const s = await setup();
    expect((await call('/scheduling/allocations/42', s.token)).status).toBe(400);
    expect((await call(`/scheduling/allocations/${s.annWork.id}`, s.linkedToken)).status).toBe(403);
  });
});

describe('GET /scheduling/allocations/:allocationId/history (AC-16)', () => {
  it('answers 200 with a page oldest first, even for a removed allocation', async () => {
    const s = await setup();
    const removedId = '01933b8e-0000-7000-8000-00000000a110';
    const segment = { startsOn: day(-60), endsOn: day(30), rateMinutes: 600, ratePeriod: 'week' };
    await withDb((db) =>
      seedAllocationHistory(db, [
        makeHistoryEntry({
          allocationId: removedId,
          employeeId: s.ann.id,
          projectId: s.atlas.id,
          changedBy: s.planner.id,
          afterValues: [segment as never],
          createdAt: new Date(Date.now() - 60 * DAY_MS),
        }),
        makeHistoryEntry({
          allocationId: removedId,
          employeeId: s.ann.id,
          projectId: s.atlas.id,
          changedBy: s.planner.id,
          changeKind: 'removed',
          effectiveFrom: day(-1),
          beforeValues: [segment as never],
          afterValues: null,
          createdAt: new Date(Date.now() - DAY_MS),
        }),
      ]),
    );

    const res = await call(`/scheduling/allocations/${removedId}/history?limit=1`, s.token);
    expect(res.status).toBe(200);
    const first = await body(AllocationHistoryPage, res);
    expect(first.items.map((item) => item.changeKind)).toEqual(['created']);
    expect(first.items[0]).toMatchObject({
      employee: { id: s.ann.id, fullName: 'Ann Resource' },
      project: { id: s.atlas.id, name: 'Atlas', type: 'client' },
      changedBy: { id: s.planner.id, name: 'Test Planner' },
      before: null,
    });
    expect(first).toMatchObject({ hasNext: true, hasPrev: false });

    const second = await body(
      AllocationHistoryPage,
      await call(
        `/scheduling/allocations/${removedId}/history?limit=1&after=${first.nextCursor}`,
        s.token,
      ),
    );
    expect(second.items.map((item) => item.changeKind)).toEqual(['removed']);
    expect(second).toMatchObject({ hasNext: false, hasPrev: true, nextCursor: null });
  });

  it('answers an empty page for an unknown id, 403 without permission', async () => {
    const s = await setup();
    const res = await call(`/scheduling/allocations/${UNKNOWN_ID}/history`, s.token);
    expect(res.status).toBe(200);
    expect(await body(AllocationHistoryPage, res)).toEqual({
      items: [],
      hasNext: false,
      hasPrev: false,
      nextCursor: null,
    });
    expect(
      (await call(`/scheduling/allocations/${UNKNOWN_ID}/history`, s.linkedToken)).status,
    ).toBe(403);
  });
});
