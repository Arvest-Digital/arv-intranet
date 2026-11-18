import {
  Allocation as AllocationDto,
  AllocationHistoryPage,
  Board as BoardDto,
  FreeList as FreeListDto,
  MySchedule as MyScheduleDto,
  SchedulingErrorCodes,
  type ValidationIssues,
  type WindowRuleViolations,
} from '@arv/contracts/scheduling';
import { Invalid, NotFound } from '@arv/contracts/shared';
import { Effect, Option, Schema } from 'effect';
import type { Board, BoardAllocation, BoardRow } from '../application/board';
import type { FreeListResource } from '../application/free-list';
import type { AllocationView } from '../application/get-allocation';
import type { AllocationHistoryItem } from '../application/history';
import type { MySchedule } from '../application/my-schedule';
import type { Page } from '../application/page';
import type { ChangerRef, Refs, WithRefs } from '../application/refs';
import type { Segment } from '../domain/allocation';
import type {
  AllocationNotFound,
  BoardWindowOutOfRange,
  FreeListQueryInvalid,
  NotSetUpAsResource,
} from '../domain/errors';
import type { FreeList } from '../domain/free-list';
import { TICKS_PER_MINUTE, type Ticks } from '../domain/ticks';
import type { WeekFigures } from '../domain/weekly-figures';

// Domain → contract DTO (`Schema.encodeSync`) and domain error → shared contract error. Messages
// are the contract's (openapi.yaml `components.examples`). Every result arrives already redacted
// by its query (AC-22, AC-29); the presenter only renames and converts.

/** Shown when the login that last changed something has since been removed from the intranet. */
const FORMER_USER = 'Former user';

/** Exact ticks → exact minutes, possibly fractional (ADR-0009); rounding is the web's, for display. */
const minutes = (ticks: Ticks) => ticks / TICKS_PER_MINUTE;

const userRef = ({ id, name }: ChangerRef) => ({ id, name: name ?? FORMER_USER });

const projectRef = (project: BoardAllocation['project']) =>
  project === null ? null : { id: project.id, name: project.name, type: project.type };

const segmentDto = (s: Segment) => ({
  startsOn: s.startsOn,
  endsOn: s.endsOn,
  rateMinutes: s.rateMinutes,
  ratePeriod: s.ratePeriod,
});

const cellDto = (week: WeekFigures) => ({
  weekStart: week.weekStart,
  state: week.state,
  allocatedMinutes: minutes(week.allocated),
  capacityMinutes: Option.match(week.capacity, { onNone: () => null, onSome: minutes }),
  leaveDays: week.leaveDays,
});

const boardAllocationDto = (refs: Refs) => (a: BoardAllocation) => ({
  id: a.id,
  project: projectRef(a.project),
  away: a.away,
  segments: a.segments.map(segmentDto),
  minutesPerWeek: a.allocatedPerWeek.map((w) => ({
    weekStart: w.weekStart,
    minutes: minutes(w.allocated),
  })),
  needsAttention: a.needsAttention,
  version: a.version,
  lastChangedBy: userRef(refs.user(a.lastChangedBy)),
  lastChangedAt: a.lastChangedAt,
});

const employeeOfRow = (refs: Refs, row: BoardRow) => ({
  id: row.employeeId,
  fullName: row.fullName,
  team: refs.team(row.teamId),
});

/** OpenAPI `Board`. */
export const presentBoard = ({ value: board, refs }: WithRefs<Board>) =>
  Schema.encodeSync(BoardDto)({
    from: board.from,
    to: board.to,
    weeks: board.weeks,
    rows: board.rows.map((row) => ({
      employee: employeeOfRow(refs, row),
      employmentEnd: row.employmentEnd,
      incomplete: row.incomplete,
      cells: row.cells.map(cellDto),
      allocations: row.allocations.map(boardAllocationDto(refs)),
    })),
  });

/** OpenAPI `MySchedule`. */
export const presentMySchedule = ({ value: mine, refs }: WithRefs<MySchedule>) =>
  Schema.encodeSync(MyScheduleDto)({
    employee: employeeOfRow(refs, mine),
    from: mine.from,
    to: mine.to,
    weeks: mine.weeks,
    cells: mine.cells.map(cellDto),
    allocations: mine.allocations.map(boardAllocationDto(refs)),
  });

/** OpenAPI `FreeList`. */
export const presentFreeList = ({ value: list, refs }: WithRefs<FreeList<FreeListResource>>) => {
  const employee = (r: FreeListResource) => ({
    id: r.employeeId,
    fullName: r.fullName,
    team: refs.team(r.teamId),
  });
  return Schema.encodeSync(FreeListDto)({
    from: list.from,
    to: list.to,
    weeks: list.weeks,
    items: list.entries.map((entry) => ({
      employee: employee(entry.resource),
      freeMinutesTotal: minutes(entry.freeTotal),
      freeMinutesPerWeek: entry.freePerWeek.map((w) => ({
        weekStart: w.weekStart,
        minutes: minutes(w.free),
      })),
    })),
    incompleteRecords: list.incompleteRecords.map(employee),
  });
};

/** OpenAPI `Allocation`. */
export const presentAllocation = ({ value: a, refs }: WithRefs<AllocationView>) =>
  Schema.encodeSync(AllocationDto)({
    id: a.id,
    employee: refs.employee(a.employeeId),
    project: projectRef(a.project),
    away: a.away,
    segments: [segmentDto(a.segments[0]), ...a.segments.slice(1).map(segmentDto)],
    needsAttention: a.needsAttention,
    version: a.version,
    lastChangedBy: userRef(refs.user(a.lastChangedBy)),
    lastChangedAt: a.lastChangedAt,
    createdAt: a.createdAt,
  });

/** OpenAPI `AllocationHistoryPage`. */
export const presentAllocationHistoryPage = ({
  value: page,
  refs,
}: WithRefs<Page<AllocationHistoryItem>>) =>
  Schema.encodeSync(AllocationHistoryPage)({
    ...page,
    items: page.items.map((item) => ({
      id: item.id,
      allocationId: item.allocationId,
      employee: refs.employee(item.employeeId),
      project: projectRef(item.project),
      away: item.away,
      changeKind: item.changeKind,
      effectiveFrom: item.effectiveFrom,
      before: item.before === null ? null : item.before.map(segmentDto),
      after: item.after === null ? null : item.after.map(segmentDto),
      changedBy: userRef(refs.user(item.changedBy)),
      createdAt: item.changedAt,
    })),
  });

/** Every scheduling failure a read route can produce; each maps without looking anything up. */
export type SchedulingError =
  | BoardWindowOutOfRange
  | FreeListQueryInvalid
  | NotSetUpAsResource
  | AllocationNotFound;

const SCHEDULING_ERROR_TAGS: ReadonlySet<string> = new Set<SchedulingError['_tag']>([
  'BoardWindowOutOfRange',
  'FreeListQueryInvalid',
  'NotSetUpAsResource',
  'AllocationNotFound',
]);

export const isSchedulingError = (error: { readonly _tag: string }): error is SchedulingError =>
  SCHEDULING_ERROR_TAGS.has(error._tag);

export const toSchedulingContractError = (error: SchedulingError) => {
  switch (error._tag) {
    case 'BoardWindowOutOfRange': {
      const details: WindowRuleViolations = { rules: ['window_out_of_range'] };
      return new Invalid({
        message: 'The board shows at most 12 months back and 52 weeks ahead',
        code: SchedulingErrorCodes.windowOutOfRange,
        details,
      });
    }
    case 'FreeListQueryInvalid': {
      // AC-05: a plain validation failure, but with the one wording the free list shows.
      const details: ValidationIssues = { issues: error.issues };
      return new Invalid({
        message: error.message,
        code: 'platform.validation_failed',
        details,
      });
    }
    case 'NotSetUpAsResource':
      return new NotFound({
        resource: 'Employee record',
        id: error.userId,
        code: SchedulingErrorCodes.notAResource,
        explanation:
          'You are not set up as a resource yet; someone with the manage-employee-records permission can link you',
      });
    case 'AllocationNotFound':
      return new NotFound({
        resource: 'Allocation',
        id: error.allocationId,
        code: SchedulingErrorCodes.allocationNotFound,
      });
  }
};

/**
 * Maps scheduling's domain failures to contract errors and lets every other failure through (the
 * kernel's access errors, which `runEffect` maps once).
 */
export const mapSchedulingErrors = <A, E extends { readonly _tag: string }, R>(
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.mapError(effect, (error) =>
    isSchedulingError(error)
      ? toSchedulingContractError(error)
      : (error as Exclude<E, SchedulingError>),
  );
