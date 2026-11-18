import { type EmployeeId, type ProjectId, Today, type UserId } from '@arv/kernel';
import { OrgApi, type ResourceTerms, type TeamId } from '@arv/org';
import { type ProjectInfo, ProjectsApi } from '@arv/projects';
import { Effect, Option } from 'effect';
import type { AllocationId, IsoDate } from '../domain/allocation';
import { Segment } from '../domain/allocation';
import { addDays, type Holidays, isIncompleteRecord, isoWeekStart } from '../domain/capacity';
import { BoardWindowOutOfRange } from '../domain/errors';
import type { Ticks } from '../domain/ticks';
import {
  canFilterByLeaveProjects,
  employmentEndView,
  ProjectLabel,
  projectLabel,
  type Viewer,
} from '../domain/visibility';
import {
  type EndVisibility,
  runsPastEmploymentEnd,
  type WeekFigures,
  weeklyFigures,
} from '../domain/weekly-figures';
import { termsOf } from './allocations/context';
import { type AllocationInWindow, AllocationRepository, type DateWindow } from './ports';
import { requireBoardViewer, withOwnEmployee } from './viewer';

/** Week columns shown by default and at most (AC-01, ADR-0002). */
export const BOARD_WEEKS = 12;
/** How far back the board scrolls, view only (AC-01). */
export const BOARD_MONTHS_BACK = 12;
/** How far ahead the board scrolls, counted from the current week (AC-01). */
export const BOARD_WEEKS_AHEAD = 52;

/** The board query as the URL carries it (ADR-0002); filters narrow it (AC-02). */
export interface BoardQuery {
  /** Any date in the first week; defaults to today's week. */
  readonly from?: IsoDate;
  /** Number of week columns, 1 to 12; defaults to 12. */
  readonly weeks?: number;
  readonly teamId?: TeamId;
  readonly projectId?: ProjectId;
}

/** A board window: whole ISO weeks, Monday of the first to Sunday of the last. */
export interface BoardWindow extends DateWindow {
  /** The Monday of each week column. */
  readonly weeks: ReadonlyArray<IsoDate>;
}

/** The same calendar day `months` months earlier, clamped to the month's last day. */
export const monthsBefore = (date: IsoDate, months: number): IsoDate => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  first.setUTCDate(Math.min(d, lastDay.getUTCDate()));
  return first.toISOString().slice(0, 10);
};

/**
 * The window of `weeks` week columns starting in the week of `from` (AC-01, ADR-0002). The first
 * week may start no earlier than the week 12 months before today; the last week may start no
 * later than 52 weeks after the current week. Otherwise → `BoardWindowOutOfRange`.
 */
export const boardWindow = (
  today: IsoDate,
  from: IsoDate | undefined,
  weeks: number = BOARD_WEEKS,
): Effect.Effect<BoardWindow, BoardWindowOutOfRange> => {
  const currentWeek = isoWeekStart(today);
  const earliestFrom = isoWeekStart(monthsBefore(today, BOARD_MONTHS_BACK));
  const latestTo = addDays(currentWeek, 7 * BOARD_WEEKS_AHEAD + 6);
  const start = isoWeekStart(from ?? today);
  const end = addDays(start, 7 * weeks - 1);
  if (
    !Number.isInteger(weeks) ||
    weeks < 1 ||
    weeks > BOARD_WEEKS ||
    start < earliestFrom ||
    end > latestTo
  ) {
    return Effect.fail(
      new BoardWindowOutOfRange({ earliestFrom, latestTo, maxWeeks: BOARD_WEEKS }),
    );
  }
  return Effect.succeed({
    from: start,
    to: end,
    weeks: Array.from({ length: weeks }, (_, i) => addDays(start, 7 * i)),
  });
};

/** One allocation's hours in one week column. */
export interface WeekTicks {
  readonly weekStart: IsoDate;
  readonly allocated: Ticks;
}

/** An allocation on the board, already redacted for the viewer. */
export interface BoardAllocation {
  readonly id: AllocationId;
  /** `null` for leave whose type the viewer may not see: only «away» (AC-29). */
  readonly project: ProjectInfo | null;
  /** Leave (a leave-type project), shown as «away» (AC-01, AC-15). */
  readonly away: boolean;
  /** The segments overlapping the window, cut at a hidden employment end (AC-22). */
  readonly segments: ReadonlyArray<Segment>;
  readonly allocatedPerWeek: ReadonlyArray<WeekTicks>;
  /** Runs past the employment end (AC-21); `null` when the viewer may not see the mark (AC-22). */
  readonly needsAttention: boolean | null;
  readonly version: number;
  readonly lastChangedBy: UserId;
  readonly lastChangedAt: Date;
}

/** One resource row, already redacted for the viewer. */
export interface BoardRow {
  readonly employeeId: EmployeeId;
  readonly fullName: string;
  readonly teamId: TeamId | null;
  /** `null` when there is none or the viewer may not see it (AC-22). */
  readonly employmentEnd: IsoDate | null;
  /** No contract hours or no start date: capacity unknown (AC-06). */
  readonly incomplete: boolean;
  /** One per week column, in exact ticks, each in exactly one state (AC-01). */
  readonly cells: ReadonlyArray<WeekFigures>;
  readonly allocations: ReadonlyArray<BoardAllocation>;
}

export interface Board extends BoardWindow {
  /** One per resource whose employment period overlaps the window, by full name (AC-01). */
  readonly rows: ReadonlyArray<BoardRow>;
}

/** Employed on some day of the window; an unknown start counts (AC-06). */
const overlaps = (resource: ResourceTerms, window: DateWindow): boolean =>
  (resource.employmentStart === null || resource.employmentStart <= window.to) &&
  (resource.employmentEnd === null || resource.employmentEnd >= window.from);

/**
 * The allocation as the viewer may see it: segments after a hidden employment end are dropped and
 * the one spanning it is cut at it (AC-22). `None` when nothing is left.
 */
const visiblePart = (
  allocation: AllocationInWindow,
  until: IsoDate | null,
): Option.Option<AllocationInWindow> => {
  if (until === null) return Option.some(allocation);
  const segments = allocation.segments
    .filter((s) => s.startsOn <= until)
    .map((s) => (s.endsOn <= until ? s : new Segment({ ...s, endsOn: until })));
  return segments.length === 0 ? Option.none() : Option.some({ ...allocation, segments });
};

const projectOf = (projects: ReadonlyMap<ProjectId, ProjectInfo>, id: ProjectId): ProjectInfo => {
  const project = projects.get(id);
  // No foreign key across modules, but projects are never deleted: a missing one is a defect.
  if (project === undefined) throw new Error(`allocation references unknown project ${id}`);
  return project;
};

export const buildRow = (
  viewer: Viewer,
  window: BoardWindow,
  resource: ResourceTerms,
  allocations: ReadonlyArray<AllocationInWindow>,
  projects: ReadonlyMap<ProjectId, ProjectInfo>,
  holidays: Holidays,
): BoardRow => {
  const end = employmentEndView(viewer, resource.employmentEnd);
  const visibility: EndVisibility = end;
  const terms = termsOf(resource);
  const visible = allocations.flatMap((a) => Option.toArray(visiblePart(a, end.allocationsUntil)));
  const cells = weeklyFigures(
    { terms, allocations: visible },
    holidays,
    window.from,
    window.to,
    visibility,
  );
  return {
    employeeId: resource.employeeId,
    fullName: resource.fullName,
    teamId: resource.teamId,
    employmentEnd: end.employmentEnd,
    incomplete: isIncompleteRecord(terms),
    cells,
    allocations: visible.map((allocation): BoardAllocation => {
      const project = projectOf(projects, allocation.projectId);
      const label = projectLabel(viewer, resource.employeeId, {
        id: project.id,
        name: project.name,
        isLeave: project.type === 'leave',
      });
      return {
        id: allocation.id,
        project: ProjectLabel.$is('Away')(label) ? null : project,
        away: project.type === 'leave',
        segments: allocation.segments,
        allocatedPerWeek: weeklyFigures(
          { terms, allocations: [allocation] },
          holidays,
          window.from,
          window.to,
          visibility,
        ).map((week) => ({ weekStart: week.weekStart, allocated: week.allocated })),
        needsAttention: end.needingAttention ? runsPastEmploymentEnd(allocation, terms) : null,
        version: allocation.version,
        lastChangedBy: allocation.lastChangedBy,
        lastChangedAt: allocation.lastChangedAt,
      };
    }),
  };
};

/**
 * Critical flow 3: the board for a week window, redacted for this call's actor (AC-01, AC-02,
 * AC-03, AC-06, AC-12b, AC-21, AC-22, AC-29; ADR-0002, ADR-0005).
 *
 * - Neither view-whole-board nor edit-allocations → `PermissionDenied`, nothing read (AC-03).
 * - A window of more than 12 weeks, or starting more than 12 months back or ending more than 52
 *   weeks ahead → `BoardWindowOutOfRange`.
 * - One row per resource whose employment period overlaps the window (incomplete records
 *   included and marked, AC-06), narrowed to a team and / or to resources with an allocation to
 *   a project in the window (AC-02). A leave project the viewer may not filter by, or an unknown
 *   project, narrows to nothing (AC-29).
 * - Leave shows as «away» without its project unless the viewer may see its type (AC-29);
 *   employment ends, allocations after them and needing-attention marks are hidden from viewers
 *   who may not see them, who see only zero capacity there (AC-22).
 */
export const getBoard = (query: BoardQuery = {}) =>
  Effect.gen(function* () {
    const boardViewer = yield* requireBoardViewer;
    const today = yield* (yield* Today).date;
    const window = yield* boardWindow(today, query.from, query.weeks);
    const org = yield* OrgApi;
    const projectsApi = yield* ProjectsApi;
    const allocations = yield* AllocationRepository;
    const viewer = yield* withOwnEmployee(boardViewer);
    const empty: Board = { ...window, rows: [] };

    let resources: ReadonlyArray<ResourceTerms>;
    let holidayList: ReadonlyArray<{ readonly holidayDate: IsoDate }>;
    if (query.projectId !== undefined) {
      const projectId = query.projectId;
      const project = yield* projectsApi.get(projectId);
      if (
        Option.isNone(project) ||
        (project.value.type === 'leave' && !canFilterByLeaveProjects(viewer))
      ) {
        return empty;
      }
      const onProject = yield* allocations.listInWindow(window, { projectId });
      const ids = [...new Set(onProject.map((a) => a.employeeId))];
      if (ids.length === 0) return empty;
      const terms = yield* org.employmentTerms(ids, window);
      // AC-22: an allocation the viewer may not see does not put its resource on the board.
      resources = terms.resources.filter((resource) => {
        const until = employmentEndView(viewer, resource.employmentEnd).allocationsUntil;
        return (
          overlaps(resource, window) &&
          (query.teamId === undefined || resource.teamId === query.teamId) &&
          onProject.some(
            (a) => a.employeeId === resource.employeeId && Option.isSome(visiblePart(a, until)),
          )
        );
      });
      holidayList = terms.holidays;
    } else {
      const employed = yield* org.employedIn(window, query.teamId);
      resources = employed.resources;
      holidayList = employed.holidays;
    }
    if (resources.length === 0) return empty;

    const inWindow = yield* allocations.listInWindow(window, {
      employeeIds: resources.map((r) => r.employeeId),
    });
    const projectList = yield* projectsApi.listByIds([
      ...new Set(inWindow.map((a) => a.projectId)),
    ]);
    const projects = new Map(projectList.map((p) => [p.id, p]));
    const holidays: Holidays = new Set(holidayList.map((h) => h.holidayDate));

    const board: Board = {
      ...window,
      rows: resources.map((resource) =>
        buildRow(
          viewer,
          window,
          resource,
          inWindow.filter((a) => a.employeeId === resource.employeeId),
          projects,
          holidays,
        ),
      ),
    };
    return board;
  });
