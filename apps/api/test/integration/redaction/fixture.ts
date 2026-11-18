import { env } from 'cloudflare:test';
import {
  makeAccessRole,
  makeAllocation,
  makeEmployeeRecord,
  makeHistoryEntry,
  makeProject,
  makePublicHoliday,
  makeSession,
  makeTeam,
  makeUser,
  type SegmentSeed,
  seedAccessRoles,
  seedAllocationHistory,
  seedAllocations,
  seedEmployeeRecords,
  seedProjects,
  seedPublicHolidays,
  seedSessions,
  seedTeams,
  seedUserAccessRoles,
  seedUsers,
} from '@arv/db/testing';
import { calendarDateIn } from '@arv/kernel';
import { withDb } from '../../helpers';

/**
 * The QG-2 redaction fixture (sad §10, T32): one viewer per combination of the five permissions
 * any read endpoint looks at, each linked to a resource of their own, plus one resource that is
 * nobody's own. Every resource has the same shape, so each read can be checked on «own» and
 * «other» alike:
 *
 * - employment ends on `END` (40 days from today, inside the default 12-week board window);
 * - `work`: 20 h a week on Atlas from 30 days ago to 120 days ahead — it runs past `END`
 *   (needs attention, AC-21) and is cut at `END` for viewers who may not see the end (AC-22);
 * - `late`: 10 h a week on Atlas wholly after `END` — invisible to those viewers;
 * - `leave`: a whole week of leave three weeks ahead, before `END`. The other resource's leave
 *   is «Sick leave», every own resource's «Parental leave», so a leaked «Sick leave» anywhere in
 *   a body is always someone else's leave type (AC-29).
 *
 * Each allocation also has a `created` history entry, as the use cases write one.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today and its neighbours in the Worker's company time zone (wrangler `COMPANY_TIME_ZONE`). */
export const day = (offset: number) =>
  calendarDateIn(env.COMPANY_TIME_ZONE)(Date.now() + offset * DAY_MS);

export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** The Monday of the ISO week of `date`. */
export const mondayOf = (date: string) => {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
};

/** Every resource's last day of employment. */
export const END = day(40);
export const WORK_END = day(120);

/** The permissions some read endpoint decides on (openapi.yaml operation descriptions). */
export const PERMISSIONS = {
  V: 'scheduling:view-whole-board',
  E: 'scheduling:edit-allocations',
  L: 'scheduling:see-leave-reasons',
  M: 'org:manage-employee-records',
  P: 'projects:manage-projects',
} as const;
export type Flag = keyof typeof PERMISSIONS;
const FLAGS = Object.keys(PERMISSIONS) as Flag[];

/** One permission combination; `label` lists the flags held, `-` for none. */
export interface Combo {
  readonly label: string;
  readonly holds: ReadonlySet<Flag>;
}

/** All 2^5 combinations, the empty one first. */
export const COMBOS: ReadonlyArray<Combo> = Array.from({ length: 2 ** FLAGS.length }, (_, mask) => {
  const holds = new Set(FLAGS.filter((_, bit) => (mask & (1 << bit)) !== 0));
  return { label: holds.size === 0 ? '-' : [...holds].join('+'), holds };
});

/** A resource's seeded allocations, by role in the fixture. */
export interface ResourceFixture {
  readonly id: string;
  readonly fullName: string;
  /** The leave-type project of this resource's leave. */
  readonly leaveProject: { readonly id: string; readonly name: string };
  readonly work: string;
  readonly late: string;
  readonly leave: string;
}

export interface Viewer extends Combo {
  readonly token: string;
  readonly own: ResourceFixture;
}

export interface Fixture {
  readonly viewers: ReadonlyArray<Viewer>;
  readonly other: ResourceFixture;
  readonly atlas: { readonly id: string; readonly name: string };
  readonly sick: { readonly id: string; readonly name: string };
  readonly parental: { readonly id: string; readonly name: string };
  readonly teamId: string;
}

const workSegment: SegmentSeed = {
  startsOn: day(-30),
  endsOn: WORK_END,
  rateMinutes: 1200,
  ratePeriod: 'week',
};
const lateSegment: SegmentSeed = {
  startsOn: day(50),
  endsOn: day(70),
  rateMinutes: 600,
  ratePeriod: 'week',
};
const leaveMonday = addDays(mondayOf(day(0)), 21);
const leaveSegment: SegmentSeed = {
  startsOn: leaveMonday,
  endsOn: addDays(leaveMonday, 4),
  rateMinutes: null,
  ratePeriod: 'full-day',
};

export const seedFixture = (): Promise<Fixture> =>
  withDb(async (db) => {
    const [planner] = await seedUsers(db, [makeUser({ name: 'Test Planner' })]);
    const changedBy = planner!.id;
    const users = await seedUsers(
      db,
      COMBOS.map((combo, i) => makeUser({ name: `Test Viewer ${i} ${combo.label}` })),
    );
    const roles = await seedAccessRoles(
      db,
      COMBOS.map((combo, i) =>
        makeAccessRole({
          name: `Matrix role ${i} ${combo.label}`,
          permissionKeys: [...combo.holds].map((flag) => PERMISSIONS[flag]),
        }),
      ),
    );
    await seedUserAccessRoles(
      db,
      COMBOS.flatMap((combo, i) =>
        combo.holds.size === 0 ? [] : [{ userId: users[i]!.id, accessRoleId: roles[i]!.id }],
      ),
    );
    const sessions = await seedSessions(
      db,
      users.map((u) => makeSession({ userId: u!.id })),
    );

    const [team] = await seedTeams(db, [makeTeam({ name: 'Platform' })]);
    await seedPublicHolidays(db, [makePublicHoliday({ holidayDate: day(60), name: 'Test Day' })]);
    const [atlas, sick, parental] = await seedProjects(db, [
      makeProject({ name: 'Atlas' }),
      makeProject({ name: 'Sick leave', type: 'leave' }),
      makeProject({ name: 'Parental leave', type: 'leave' }),
    ]);

    const records = await seedEmployeeRecords(db, [
      makeEmployeeRecord({
        fullName: 'Other Resource',
        teamId: team!.id,
        employmentStart: day(-400),
        employmentEnd: END,
        lastChangedBy: changedBy,
      }),
      ...COMBOS.map((combo, i) =>
        makeEmployeeRecord({
          fullName: `Own Resource ${i} ${combo.label}`,
          userId: users[i]!.id,
          teamId: team!.id,
          employmentStart: day(-400),
          employmentEnd: END,
          lastChangedBy: changedBy,
        }),
      ),
    ]);

    const resources: ResourceFixture[] = [];
    for (const [i, record] of records.entries()) {
      const leaveProject = i === 0 ? sick! : parental!;
      const [work, late, leave] = await seedAllocations(db, [
        makeAllocation({
          employeeId: record!.id,
          projectId: atlas!.id,
          segments: [workSegment],
          lastChangedBy: changedBy,
        }),
        makeAllocation({
          employeeId: record!.id,
          projectId: atlas!.id,
          segments: [lateSegment],
          lastChangedBy: changedBy,
        }),
        makeAllocation({
          employeeId: record!.id,
          projectId: leaveProject.id,
          segments: [leaveSegment],
          lastChangedBy: changedBy,
        }),
      ]);
      await seedAllocationHistory(
        db,
        [
          [work!, workSegment],
          [late!, lateSegment],
          [leave!, leaveSegment],
        ].map(([allocation, segment]) =>
          makeHistoryEntry({
            allocationId: (allocation as { id: string }).id,
            employeeId: record!.id,
            projectId: (allocation as { projectId: string }).projectId,
            changedBy,
            afterValues: [segment as SegmentSeed],
          }),
        ),
      );
      resources.push({
        id: record!.id,
        fullName: record!.fullName,
        leaveProject: { id: leaveProject.id, name: leaveProject.name },
        work: work!.id,
        late: late!.id,
        leave: leave!.id,
      });
    }

    const [other, ...own] = resources;
    return {
      viewers: COMBOS.map((combo, i) => ({ ...combo, token: sessions[i]!.token, own: own[i]! })),
      other: other!,
      atlas: { id: atlas!.id, name: atlas!.name },
      sick: { id: sick!.id, name: sick!.name },
      parental: { id: parental!.id, name: parental!.name },
      teamId: team!.id,
    };
  });
