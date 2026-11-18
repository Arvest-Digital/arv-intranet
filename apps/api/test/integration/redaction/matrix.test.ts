import {
  EmployeeRecord,
  EmployeeRecordPage,
  PublicHolidayPage,
  TeamPage,
} from '@arv/contracts/org';
import { ProjectPage } from '@arv/contracts/projects';
import {
  Allocation,
  AllocationHistoryPage,
  Board,
  FreeList,
  MySchedule,
} from '@arv/contracts/scheduling';
import { ApiErrorBody } from '@arv/contracts/shared';
import { Schema } from 'effect';
import { beforeAll, describe, expect, it } from 'vitest';
import openapi from '../../../../../docs/features/resource-scheduling/contracts/openapi.yaml?raw';
import { api, resetDb } from '../../helpers';
import {
  COMBOS,
  day,
  END,
  type Fixture,
  type Flag,
  type ResourceFixture,
  seedFixture,
  type Viewer,
  WORK_END,
} from './fixture';

/**
 * T32 — the QG-2 redaction matrix (sad §10: 0 responses leak a leave type or an employment end;
 * AC-03, AC-12b, AC-22, AC-29). Every read operation of openapi.yaml × every combination of the
 * permissions reads decide on × the viewer's own resource and someone else's, through the real
 * Worker, asserting on the response bodies. The expectations below restate the contract's rules
 * (openapi.yaml «Redaction», each operation's «Requires …»), independently of the visibility
 * policy in `@arv/scheduling`.
 *
 * Signed off by the Security Lead at the security review (PRD §6.1; sync report D-5).
 */

let f: Fixture;
beforeAll(async () => {
  await resetDb();
  f = await seedFixture();
}, 60_000);

// ── the rules, as openapi.yaml states them ──────────────────────────────────────────────────

const holds = (v: Viewer, flag: Flag) => v.holds.has(flag);
/** Board, free list, an allocation and its history (AC-03; edit includes view, AC-12b). */
const mayViewBoard = (v: Viewer) => holds(v, 'V') || holds(v, 'E');
/** Employment end, allocations after it and needing-attention marks (AC-22). */
const maySeeEnd = (v: Viewer) => holds(v, 'M') || holds(v, 'E');
/** A leave's type: see-leave-reasons, or the resource's own leave (AC-29). */
const maySeeLeaveType = (v: Viewer, resourceId: string) => holds(v, 'L') || v.own.id === resourceId;
/** `listProjects` (and its leave projects, AC-29). */
const mayListProjects = (v: Viewer) => holds(v, 'V') || holds(v, 'E') || holds(v, 'P');
const mayListLeaveProjects = (v: Viewer) => holds(v, 'L') || holds(v, 'E') || holds(v, 'P');
/** `listTeams`. */
const mayListTeams = (v: Viewer) => holds(v, 'V') || holds(v, 'E') || holds(v, 'M');
/** `listEmployeeRecords`, `getEmployeeRecord`. */
const mayReadRecords = (v: Viewer) => holds(v, 'M');

// ── request and assertion helpers ───────────────────────────────────────────────────────────

const get = async (path: string, v: Viewer) => {
  const res = await api(path, { headers: { authorization: `Bearer ${v.token}` } });
  return { status: res.status, text: await res.text() };
};

const decode = <S extends Schema.Schema.AnyNoContext>(schema: S, text: string) =>
  Schema.decodeUnknownSync(schema)(JSON.parse(text)) as Schema.Schema.Type<S>;

const expectStatus = (res: { status: number; text: string }, status: number) =>
  expect(res.status, res.text).toBe(status);

const expectForbidden = (res: { status: number; text: string }, module: string) => {
  expectStatus(res, 403);
  expect(decode(ApiErrorBody, res.text).error).toMatchObject({
    _tag: 'Forbidden',
    code: `${module}.missing_permission`,
  });
};

/**
 * The other resource's leave is the only «Sick leave» in the fixture: without see-leave-reasons
 * neither its name nor its project id may appear anywhere in a body (AC-29).
 */
const expectNoSickLeave = (v: Viewer, text: string) => {
  if (holds(v, 'L')) return;
  expect(text).not.toContain(f.sick.name);
  expect(text).not.toContain(f.sick.id);
};

const resourceById = (id: string): ResourceFixture | undefined =>
  id === f.other.id ? f.other : f.viewers.find((viewer) => viewer.own.id === id)?.own;

interface SegmentLike {
  readonly startsOn: string;
  readonly endsOn: string;
}
interface AllocationLike {
  readonly id: string;
  readonly project: { readonly id: string; readonly name: string; readonly type: string } | null;
  readonly away: boolean;
  readonly segments: ReadonlyArray<SegmentLike>;
  readonly needsAttention: boolean | null;
}

/** Nothing after a hidden end: segments cut at it, never past it (AC-22). */
const expectCutAtEnd = (v: Viewer, segments: ReadonlyArray<SegmentLike> | null) => {
  if (maySeeEnd(v) || segments === null) return;
  for (const segment of segments) expect(segment.endsOn <= END, segment.endsOn).toBe(true);
};

/** One allocation of resource `r` as viewer `v` may see it. */
const expectAllocation = (v: Viewer, r: ResourceFixture, a: AllocationLike) => {
  if (a.id === r.leave) {
    expect(a.away).toBe(true);
    expect(a.project).toEqual(
      maySeeLeaveType(v, r.id) ? { ...r.leaveProject, type: 'leave' } : null,
    );
  } else {
    expect(a.away).toBe(false);
    expect(a.project).toEqual({ ...f.atlas, type: 'client' });
  }
  // Work and late run past the end; leave does not (AC-21). Hidden marks are null (AC-22).
  expect(a.needsAttention).toBe(maySeeEnd(v) ? a.id !== r.leave : null);
  expectCutAtEnd(v, a.segments);
  if (a.id === r.work) {
    expect(a.segments.at(-1)?.endsOn).toBe(maySeeEnd(v) ? WORK_END : END);
  }
};

interface ScheduleLike {
  readonly cells: ReadonlyArray<{
    readonly weekStart: string;
    readonly state: string;
    readonly allocatedMinutes: number;
  }>;
  readonly allocations: ReadonlyArray<
    AllocationLike & {
      readonly minutesPerWeek: ReadonlyArray<{ weekStart: string; minutes: number }>;
    }
  >;
}

/** A board row or my schedule: every allocation redacted, nothing counted after a hidden end. */
const expectSchedule = (v: Viewer, r: ResourceFixture, row: ScheduleLike) => {
  const ids = row.allocations.map((a) => a.id);
  expect(ids).toContain(r.work);
  expect(ids).toContain(r.leave);
  // An allocation wholly after a hidden end is not shown at all (AC-22).
  expect(ids.includes(r.late)).toBe(maySeeEnd(v));
  expect(ids.every((id) => [r.work, r.late, r.leave].includes(id))).toBe(true);
  for (const a of row.allocations) {
    expectAllocation(v, r, a);
    if (!maySeeEnd(v)) {
      for (const week of a.minutesPerWeek.filter((w) => w.weekStart > END)) {
        expect(week.minutes).toBe(0);
      }
    }
  }
  const after = row.cells.filter((cell) => cell.weekStart > END);
  expect(after.length).toBeGreaterThan(0);
  if (maySeeEnd(v)) {
    // AC-21b: past the end the weeks need attention rather than overbooked.
    expect(after.some((cell) => cell.state === 'needs-attention')).toBe(true);
  } else {
    // AC-22: zero capacity, nothing allocated, never overbooked or marked.
    for (const cell of after) {
      expect(cell.allocatedMinutes).toBe(0);
      expect(['overbooked', 'needs-attention']).not.toContain(cell.state);
    }
  }
};

// ── the matrix: one check per read operation of openapi.yaml ────────────────────────────────

type ReadCheck = (v: Viewer) => Promise<void>;

const MATRIX: Record<string, ReadCheck> = {
  async getBoard(v) {
    const res = await get('/scheduling/board', v);
    expectNoSickLeave(v, res.text);
    if (!mayViewBoard(v)) return expectForbidden(res, 'scheduling');
    expectStatus(res, 200);
    const board = decode(Board, res.text);
    const rowIds = board.rows.map((row) => row.employee.id);
    expect(rowIds).toContain(v.own.id);
    expect(rowIds).toContain(f.other.id);
    for (const row of board.rows) {
      const r = resourceById(row.employee.id);
      expect(r, row.employee.fullName).toBeDefined();
      expect(row.employmentEnd).toBe(maySeeEnd(v) ? END : null);
      expectSchedule(v, r!, row);
    }

    // Narrowing by a leave project only works with see-leave-reasons (AC-29).
    const narrowed = await get(`/scheduling/board?projectId=${f.sick.id}`, v);
    expectStatus(narrowed, 200);
    expectNoSickLeave(v, narrowed.text);
    expect(decode(Board, narrowed.text).rows.map((row) => row.employee.id)).toEqual(
      holds(v, 'L') ? [f.other.id] : [],
    );
  },

  async getFreeList(v) {
    const res = await get('/scheduling/free-list?weeks=12&minFreeHours=0', v);
    expectNoSickLeave(v, res.text);
    if (!mayViewBoard(v)) return expectForbidden(res, 'scheduling');
    expectStatus(res, 200);
    // The free list never carries an end date or a mark, whoever looks.
    expect(res.text).not.toContain('employmentEnd');
    expect(res.text).not.toContain('needsAttention');
    const list = decode(FreeList, res.text);
    for (const id of [v.own.id, f.other.id]) {
      const entry = list.items.find((item) => item.employee.id === id);
      expect(entry, id).toBeDefined();
      // Past the end nobody is free: zero capacity (AC-22) or needing attention (AC-21b).
      const after = entry!.freeMinutesPerWeek.filter((week) => week.weekStart > END);
      expect(after.length).toBeGreaterThan(0);
      for (const week of after) expect(week.minutes).toBe(0);
    }
  },

  async getMySchedule(v) {
    const res = await get('/scheduling/my-schedule', v);
    expectStatus(res, 200);
    expect(res.text).not.toContain(f.other.id);
    expectNoSickLeave(v, res.text);
    expect(res.text).not.toContain('employmentEnd');
    const mine = decode(MySchedule, res.text);
    expect(mine.employee.id).toBe(v.own.id);
    // The resource always sees their own leave type (AC-29); the end only with M or E (AC-22).
    expectSchedule(v, v.own, mine);
  },

  async getAllocation(v) {
    for (const r of [v.own, f.other]) {
      for (const id of [r.work, r.late, r.leave]) {
        const res = await get(`/scheduling/allocations/${id}`, v);
        expectNoSickLeave(v, res.text);
        if (!mayViewBoard(v)) {
          expectForbidden(res, 'scheduling');
          continue;
        }
        if (id === r.late && !maySeeEnd(v)) {
          // Wholly after a hidden end: as if it did not exist (AC-22).
          expectStatus(res, 404);
          expect(decode(ApiErrorBody, res.text).error.code).toBe('scheduling.allocation_not_found');
          continue;
        }
        expectStatus(res, 200);
        const allocation = decode(Allocation, res.text);
        expect(allocation.employee.id).toBe(r.id);
        expectAllocation(v, r, allocation);
      }
    }
  },

  async listAllocationHistory(v) {
    for (const r of [v.own, f.other]) {
      for (const id of [r.work, r.late, r.leave]) {
        const res = await get(`/scheduling/allocations/${id}/history`, v);
        expectNoSickLeave(v, res.text);
        if (!mayViewBoard(v)) {
          expectForbidden(res, 'scheduling');
          continue;
        }
        expectStatus(res, 200);
        const { items } = decode(AllocationHistoryPage, res.text);
        if (id === r.late && !maySeeEnd(v)) {
          expect(items).toEqual([]);
          continue;
        }
        expect(items).toHaveLength(1);
        const [entry] = items;
        expect(entry!.employee.id).toBe(r.id);
        expect(entry!.away).toBe(id === r.leave);
        expect(entry!.project).toEqual(
          id === r.leave
            ? maySeeLeaveType(v, r.id)
              ? { ...r.leaveProject, type: 'leave' }
              : null
            : { ...f.atlas, type: 'client' },
        );
        expectCutAtEnd(v, entry!.before);
        expectCutAtEnd(v, entry!.after);
        if (id === r.work) {
          expect(entry!.after?.at(-1)?.endsOn).toBe(maySeeEnd(v) ? WORK_END : END);
        }
      }
    }
  },

  async listEmployeeRecords(v) {
    const res = await get('/org/employee-records?limit=100', v);
    if (!mayReadRecords(v)) return expectForbidden(res, 'org');
    expectStatus(res, 200);
    const page = decode(EmployeeRecordPage, res.text);
    for (const id of [v.own.id, f.other.id]) {
      expect(page.items.find((record) => record.id === id)?.employmentEnd).toBe(END);
    }
  },

  async getEmployeeRecord(v) {
    for (const r of [v.own, f.other]) {
      const res = await get(`/org/employee-records/${r.id}`, v);
      if (!mayReadRecords(v)) {
        expectForbidden(res, 'org');
        continue;
      }
      expectStatus(res, 200);
      expect(decode(EmployeeRecord, res.text)).toMatchObject({ id: r.id, employmentEnd: END });
    }
  },

  async listTeams(v) {
    const res = await get('/org/teams', v);
    if (!mayListTeams(v)) return expectForbidden(res, 'org');
    expectStatus(res, 200);
    expect(decode(TeamPage, res.text).items.map((team) => team.id)).toEqual([f.teamId]);
  },

  async listPublicHolidays(v) {
    const res = await get(`/org/public-holidays?from=${day(0)}&to=${day(365)}`, v);
    expectStatus(res, 200);
    expect(decode(PublicHolidayPage, res.text).items.map((h) => h.name)).toEqual(['Test Day']);
  },

  async listProjects(v) {
    const res = await get('/projects?limit=100', v);
    if (!mayListProjects(v)) return expectForbidden(res, 'projects');
    expectStatus(res, 200);
    const names = decode(ProjectPage, res.text).items.map((project) => project.name);
    expect(names.sort()).toEqual(
      mayListLeaveProjects(v)
        ? [f.atlas.name, f.parental.name, f.sick.name].sort()
        : [f.atlas.name],
    );
    if (!mayListLeaveProjects(v)) expectNoSickLeave(v, res.text);
  },
};

/**
 * Read operations of openapi.yaml whose route is not built yet, with the task that builds it.
 * Each must still answer 404 `platform.not_found`: once its route is mounted, that test fails
 * until the operation moves into `MATRIX`.
 */
const NOT_YET_MOUNTED: Record<string, { readonly path: string; readonly task: string }> = {
  getImportStatus: { path: '/scheduling/import', task: 'T34' },
};

/** The `operationId` of every `get` operation in openapi.yaml. */
const readOperations = (yaml: string): string[] => {
  const ids: string[] = [];
  let inGet = false;
  for (const line of yaml.split('\n')) {
    const method = /^ {4}(get|put|post|patch|delete|head|options|trace):/.exec(line);
    if (method) inGet = method[1] === 'get';
    const operation = /^ {6}operationId: (\w+)\s*$/.exec(line);
    if (operation && inGet) ids.push(operation[1]!);
  }
  return ids;
};

describe('the matrix covers every read operation of openapi.yaml', () => {
  it('enumerates them all, each once', () => {
    const inContract = readOperations(openapi).sort();
    expect(inContract).toContain('getBoard');
    expect(new Set(inContract).size).toBe(inContract.length);
    expect([...Object.keys(MATRIX), ...Object.keys(NOT_YET_MOUNTED)].sort()).toEqual(inContract);
  });

  it.each(Object.entries(NOT_YET_MOUNTED))(
    '%s is not mounted yet (%o) — move it into MATRIX once it is',
    async (_, { path }) => {
      const res = await get(path, f.viewers.at(-1)!);
      expectStatus(res, 404);
      expect(decode(ApiErrorBody, res.text).error.code).toBe('platform.not_found');
    },
  );

  it('has one viewer per permission combination, each linked to a resource', () => {
    expect(f.viewers).toHaveLength(COMBOS.length);
    expect(new Set(f.viewers.map((v) => v.own.id)).size).toBe(COMBOS.length);
  });
});

describe.each(Object.entries(MATRIX))('%s', (_, check) => {
  it.each(COMBOS.map((combo, i) => [combo.label, i] as const))('viewer holding %s', (_, i) =>
    check(f.viewers[i]!),
  );
});
