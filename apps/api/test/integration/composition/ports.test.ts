import { env } from 'cloudflare:test';
import {
  makeAccessRole,
  makeAllocation,
  makeEmployeeRecord,
  makeProject,
  makeSession,
  makeUser,
  type SegmentSeed,
  seedAccessRoles,
  seedAllocations,
  seedEmployeeRecords,
  seedProjects,
  seedSessions,
  seedUserAccessRoles,
  seedUsers,
} from '@arv/db/testing';
import { calendarDateIn } from '@arv/kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, resetDb, withDb } from '../../helpers';

/**
 * T30 — scheduling's `CapacityImpactCheck` and `ProjectClosingHook` wired in the host's real
 * composition root (ADR-0007), plus permissions read on every request (AC-14). Nothing here is
 * stubbed: if the host fell back to a module's no-op port, the warnings and the trim would be
 * skipped and these tests would fail (AC-19c, AC-25, AC-27).
 */

beforeEach(resetDb);

const DAY_MS = 24 * 60 * 60 * 1000;
const H = 60;

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

type ErrorBody = { _tag: string; code: string; message: string; details?: unknown };
const errorOf = async (res: Response) => ((await res.json()) as { error: ErrorBody }).error;

const select = (text: string) => withDb(async (db) => (await db.execute(text)).rows);

const historyRows = () =>
  select(
    'SELECT allocation_id, change_kind, changed_by FROM scheduling.allocation_history ORDER BY id',
  );

/**
 * A manager (employee records), a holiday keeper, a project manager and a planner
 * (edit-allocations), each with a session. Ann works Monday to Friday, 40 h a week; Pat works
 * Wednesday to Friday, 24 h a week. Atlas is an open client project.
 */
const setup = () =>
  withDb(async (db) => {
    const users = await seedUsers(db, [
      makeUser({ name: 'Test Manager' }),
      makeUser({ name: 'Test Keeper' }),
      makeUser({ name: 'Test Closer' }),
      makeUser({ name: 'Test Planner' }),
    ]);
    const [manager, keeper, closer, planner] = users.map((u) => u!);
    const [managers, keepers, closers, planners] = await seedAccessRoles(db, [
      makeAccessRole({ name: 'Managers', permissionKeys: ['org:manage-employee-records'] }),
      makeAccessRole({ name: 'Holiday keepers', permissionKeys: ['org:manage-holiday-list'] }),
      makeAccessRole({ name: 'Project managers', permissionKeys: ['projects:manage-projects'] }),
      makeAccessRole({ name: 'Planners', permissionKeys: ['scheduling:edit-allocations'] }),
    ]);
    await seedUserAccessRoles(db, [
      { userId: manager!.id, accessRoleId: managers!.id },
      { userId: keeper!.id, accessRoleId: keepers!.id },
      { userId: closer!.id, accessRoleId: closers!.id },
      { userId: planner!.id, accessRoleId: planners!.id },
    ]);
    const sessions = await seedSessions(
      db,
      users.map((u) => makeSession({ userId: u!.id })),
    );
    const [managerToken, keeperToken, closerToken, plannerToken] = sessions.map((s) => s!.token);

    const [ann, pat] = await seedEmployeeRecords(db, [
      makeEmployeeRecord({
        fullName: 'Ann Resource',
        employmentStart: day(-400),
        lastChangedBy: manager!.id,
      }),
      makeEmployeeRecord({
        fullName: 'Pat Resource',
        contractMinutes: 24 * H,
        workingDays: [3, 4, 5],
        employmentStart: day(-400),
        lastChangedBy: manager!.id,
      }),
    ]);
    const [atlas] = await seedProjects(db, [makeProject({ name: 'Atlas' })]);
    return {
      tokens: {
        manager: managerToken!,
        keeper: keeperToken!,
        closer: closerToken!,
        planner: plannerToken!,
      },
      closer: closer!,
      planner: planner!,
      plannersRoleId: planners!.id,
      ann: ann!,
      pat: pat!,
      atlas: atlas!,
    };
  });

type Setup = Awaited<ReturnType<typeof setup>>;

const seedOn = (s: Setup, employeeId: string, segments: SegmentSeed[]) =>
  withDb(async (db) => {
    const [allocation] = await seedAllocations(db, [
      makeAllocation({ employeeId, projectId: s.atlas.id, segments, lastChangedBy: s.planner.id }),
    ]);
    return allocation!;
  });

describe('contract-hours change through scheduling’s CapacityImpactCheck (AC-19c)', () => {
  it('409 listing the newly overbooked weeks; saved on confirm, allocations and history untouched', async () => {
    const s = await setup();
    // 32 of Ann's 40 hours in each of two coming weeks: 8 h over once she drops to 24 h.
    const allocation = await seedOn(s, s.ann.id, [
      { startsOn: MONDAY, endsOn: addDays(MONDAY, 13), rateMinutes: 32 * H, ratePeriod: 'week' },
    ]);
    const change = { version: 1, contractMinutes: 24 * H, workingDays: [1, 2, 3] };

    const warned = await send(
      'PATCH',
      `/org/employee-records/${s.ann.id}`,
      s.tokens.manager,
      change,
    );
    expect(warned.status).toBe(409);
    const error = await errorOf(warned);
    expect(error).toMatchObject({
      _tag: 'ConfirmationRequired',
      code: 'org.capacity_confirmation_required',
      details: {
        overbookedWeeks: [
          {
            employee: { id: s.ann.id, fullName: 'Ann Resource', team: null },
            weekStart: MONDAY,
            overMinutes: 8 * H,
          },
          {
            employee: { id: s.ann.id, fullName: 'Ann Resource', team: null },
            weekStart: addDays(MONDAY, 7),
            overMinutes: 8 * H,
          },
        ],
      },
    });
    const [unchanged] = await select(
      `SELECT contract_minutes, version FROM org.employee_records WHERE id = '${s.ann.id}'`,
    );
    expect(unchanged).toEqual({ contract_minutes: 40 * H, version: 1 });

    const confirmed = await send('PATCH', `/org/employee-records/${s.ann.id}`, s.tokens.manager, {
      ...change,
      confirm: true,
    });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({ contractMinutes: 24 * H, version: 2 });

    const [stored] = await select(
      `SELECT version FROM scheduling.allocations WHERE id = '${allocation.id}'`,
    );
    expect(stored).toEqual({ version: 1 });
    expect(await historyRows()).toEqual([]);
  });

  it('saves without confirmation when no week becomes overbooked', async () => {
    const s = await setup();
    await seedOn(s, s.ann.id, [
      { startsOn: MONDAY, endsOn: addDays(MONDAY, 6), rateMinutes: 20 * H, ratePeriod: 'week' },
    ]);
    const res = await send('PATCH', `/org/employee-records/${s.ann.id}`, s.tokens.manager, {
      version: 1,
      contractMinutes: 24 * H,
      workingDays: [1, 2, 3],
    });
    expect(res.status).toBe(200);
  });
});

describe('public holiday through scheduling’s CapacityImpactCheck (AC-27, AC-19c)', () => {
  it('409 naming only the full-timer for a Monday holiday; saved on confirm', async () => {
    const s = await setup();
    // Ann: Tuesday to Friday at 10 h, 40 of 40; with the Monday off, 40 of 32.
    await seedOn(s, s.ann.id, [
      {
        startsOn: addDays(MONDAY, 1),
        endsOn: addDays(MONDAY, 4),
        rateMinutes: 10 * H,
        ratePeriod: 'day',
      },
    ]);
    // Pat: her whole Wednesday-to-Friday week, which a Monday doesn't touch.
    await seedOn(s, s.pat.id, [
      {
        startsOn: addDays(MONDAY, 2),
        endsOn: addDays(MONDAY, 4),
        rateMinutes: 8 * H,
        ratePeriod: 'day',
      },
    ]);
    const holiday = { holidayDate: MONDAY, name: 'Test holiday' };

    const warned = await send('POST', '/org/public-holidays', s.tokens.keeper, holiday);
    expect(warned.status).toBe(409);
    expect(await errorOf(warned)).toMatchObject({
      _tag: 'ConfirmationRequired',
      code: 'org.capacity_confirmation_required',
      details: {
        overbookedWeeks: [
          {
            employee: { id: s.ann.id, fullName: 'Ann Resource' },
            weekStart: MONDAY,
            overMinutes: 8 * H,
          },
        ],
      },
    });
    expect(await select('SELECT id FROM org.public_holidays')).toEqual([]);

    const confirmed = await send('POST', '/org/public-holidays', s.tokens.keeper, {
      ...holiday,
      confirm: true,
    });
    expect(confirmed.status).toBe(201);
    expect(await select('SELECT holiday_date::text AS d FROM org.public_holidays')).toEqual([
      { d: MONDAY },
    ]);
    expect(await historyRows()).toEqual([]);
  });
});

describe('project close through scheduling’s ProjectClosingHook (AC-25, AC-16)', () => {
  it('409 listing 3 trims and 1 removal; on confirm trims, removes and writes history by the closer', async () => {
    const s = await setup();
    const thisMonday = mondayOf(day(0));
    const closeDate = day(10);
    const running = (rate: number): SegmentSeed[] => [
      {
        startsOn: thisMonday,
        endsOn: addDays(thisMonday, 55),
        rateMinutes: rate,
        ratePeriod: 'week',
      },
    ];
    const trimmed = [
      await seedOn(s, s.ann.id, running(8 * H)),
      await seedOn(s, s.ann.id, running(4 * H)),
      await seedOn(s, s.pat.id, running(8 * H)),
    ];
    const removed = await seedOn(s, s.pat.id, [
      {
        startsOn: addDays(closeDate, 10),
        endsOn: addDays(closeDate, 30),
        rateMinutes: 4 * H,
        ratePeriod: 'week',
      },
    ]);
    const path = `/projects/${s.atlas.id}/close`;

    const warned = await send('POST', path, s.tokens.closer, { closeDate });
    expect(warned.status).toBe(409);
    const error = await errorOf(warned);
    expect(error).toMatchObject({
      _tag: 'ConfirmationRequired',
      code: 'projects.closing_confirmation_required',
      message: `3 allocations will end on ${closeDate} and 1 will be removed`,
    });
    const details = error.details as {
      endingAtCloseDate: { allocationId: string }[];
      removed: { allocationId: string }[];
    };
    expect(details.endingAtCloseDate.map((a) => a.allocationId).sort()).toEqual(
      trimmed.map((a) => a.id).sort(),
    );
    expect(details.removed.map((a) => a.allocationId)).toEqual([removed.id]);
    expect(await historyRows()).toEqual([]);
    const [open] = await select(
      `SELECT close_date FROM projects.projects WHERE id = '${s.atlas.id}'`,
    );
    expect(open).toEqual({ close_date: null });

    const confirmed = await send('POST', path, s.tokens.closer, { closeDate, confirm: true });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({ closeDate });

    const ends = await select(
      `SELECT allocation_id, max(ends_on)::text AS ends_on FROM scheduling.allocation_segments
       GROUP BY allocation_id`,
    );
    expect(ends).toHaveLength(3);
    expect(new Set(ends.map((r) => r.allocation_id))).toEqual(new Set(trimmed.map((a) => a.id)));
    expect(ends.every((r) => r.ends_on === closeDate)).toBe(true);
    expect(
      await select(`SELECT id FROM scheduling.allocations WHERE id = '${removed.id}'`),
    ).toEqual([]);

    const history = await historyRows();
    expect(history).toHaveLength(4);
    expect(history.every((h) => h.changed_by === s.closer.id)).toBe(true);
    expect(
      history
        .filter((h) => h.change_kind === 'trimmed')
        .map((h) => h.allocation_id)
        .sort(),
    ).toEqual(trimmed.map((a) => a.id).sort());
    expect(history.filter((h) => h.change_kind === 'removed').map((h) => h.allocation_id)).toEqual([
      removed.id,
    ]);
  });
});

describe('permissions read on every request (AC-14)', () => {
  it('changing the grants between two requests changes the outcome', async () => {
    const s = await setup();
    const allocation = (startsOn: string) => ({
      employeeId: s.ann.id,
      projectId: s.atlas.id,
      startsOn,
      endsOn: addDays(startsOn, 4),
      rateMinutes: 4 * H,
      ratePeriod: 'week',
    });

    const granted = await send(
      'POST',
      '/scheduling/allocations',
      s.tokens.planner,
      allocation(MONDAY),
    );
    expect(granted.status).toBe(201);

    // The role loses edit-allocations while the planner's session stays valid.
    await select(
      `DELETE FROM identity.user_access_roles WHERE user_id = '${s.planner.id}'
         AND access_role_id = '${s.plannersRoleId}'`,
    );
    const revoked = await send(
      'POST',
      '/scheduling/allocations',
      s.tokens.planner,
      allocation(addDays(MONDAY, 7)),
    );
    expect(revoked.status).toBe(403);
    expect(await errorOf(revoked)).toMatchObject({
      _tag: 'Forbidden',
      code: 'scheduling.missing_permission',
      details: { missingPermissions: ['scheduling:edit-allocations'] },
    });

    // And back: granted again, the next save goes through.
    await select(
      `INSERT INTO identity.user_access_roles (user_id, access_role_id)
       VALUES ('${s.planner.id}', '${s.plannersRoleId}')`,
    );
    const regranted = await send(
      'POST',
      '/scheduling/allocations',
      s.tokens.planner,
      allocation(addDays(MONDAY, 14)),
    );
    expect(regranted.status).toBe(201);
    expect(await select('SELECT id FROM scheduling.allocations')).toHaveLength(2);
  });
});
