import {
  type AllocationConflictDetailsEncoded,
  Allocation as AllocationDto,
  AllocationHistoryPage,
  type AllocationImpact,
  AllocationRemoval,
  type AllocationRuleViolations,
  Board as BoardDto,
  type AllocationRule as ContractAllocationRule,
  FreeList as FreeListDto,
  MySchedule as MyScheduleDto,
  SchedulingErrorCodes,
  type ValidationIssues,
  type WindowRuleViolations,
} from '@arv/contracts/scheduling';
import { ConfirmationRequired, Conflict, Invalid, NotFound } from '@arv/contracts/shared';
import type { ProjectId } from '@arv/kernel';
import { Effect, Option, Schema } from 'effect';
import type { AllocationRemoved } from '../application/allocations';
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
  AllocationRule,
  AllocationRulesBroken,
  BoardWindowOutOfRange,
  EmployeeRecordNotFound,
  FreeListQueryInvalid,
  NotSetUpAsResource,
  OverbookingConfirmationRequired,
  ProjectClosed,
  ProjectNotFound,
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

const workProjectRef = (project: NonNullable<BoardAllocation['project']>) => ({
  id: project.id,
  name: project.name,
  type: project.type,
});

const projectRef = (project: BoardAllocation['project']) =>
  project === null ? null : workProjectRef(project);

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

/** OpenAPI `AllocationRemoval`. */
export const presentAllocationRemoval = (removed: AllocationRemoved) =>
  Schema.encodeSync(AllocationRemoval)({
    allocationId: removed.allocationId,
    outcome: removed.outcome,
    endsOn: removed.endsOn,
  });

/** AC-07b: the current values and who changed them; nothing was saved. */
export const allocationVersionConflict = (current: WithRefs<AllocationView>) => {
  const dto = presentAllocation(current);
  const details: AllocationConflictDetailsEncoded = { current: dto };
  return new Conflict({
    message: `${dto.lastChangedBy.name} changed this allocation meanwhile`,
    code: SchedulingErrorCodes.versionConflict,
    details,
  });
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * AC-10, AC-15: the overbooked weeks and the work on leave days, with the projects named; nothing
 * was saved until the request is re-sent with `confirm: true` (ADR-0010).
 */
export const overbookingConfirmationRequired = ({
  value: impact,
  refs,
}: WithRefs<OverbookingConfirmationRequired>) => {
  const details: AllocationImpact = {
    overbookedWeeks: impact.overbookedWeeks.map((week) => ({
      weekStart: week.weekStart,
      capacityMinutes: minutes(week.capacity as Ticks),
      allocatedMinutes: minutes(week.allocated as Ticks),
      overMinutes: minutes(week.over as Ticks),
    })),
    workOnLeaveDays: impact.workOnLeaveDays.map((conflict) => ({
      allocationId: conflict.allocationId,
      project: workProjectRef(refs.project(conflict.projectId as ProjectId)),
      days: conflict.days,
    })),
  };
  const weeks = impact.overbookedWeeks.length;
  const onLeave = impact.workOnLeaveDays.length;
  const parts = [
    ...(weeks > 0 ? [`The resource will be overbooked in ${plural(weeks, 'week', 'weeks')}`] : []),
    ...(onLeave > 0
      ? [`${plural(onLeave, 'work allocation falls', 'work allocations fall')} on the leave days`]
      : []),
  ];
  return new ConfirmationRequired({
    message: parts.join('; '),
    code: SchedulingErrorCodes.overbookingConfirmationRequired,
    details,
  });
};

/** Every scheduling failure that maps without looking anything up. */
export type SchedulingError =
  | BoardWindowOutOfRange
  | FreeListQueryInvalid
  | NotSetUpAsResource
  | AllocationNotFound
  | AllocationRulesBroken
  | ProjectClosed
  | EmployeeRecordNotFound
  | ProjectNotFound;

const SCHEDULING_ERROR_TAGS: ReadonlySet<string> = new Set<SchedulingError['_tag']>([
  'BoardWindowOutOfRange',
  'FreeListQueryInvalid',
  'NotSetUpAsResource',
  'AllocationNotFound',
  'AllocationRulesBroken',
  'ProjectClosed',
  'EmployeeRecordNotFound',
  'ProjectNotFound',
]);

/**
 * Rules the request schema already refuses (hours above 0, in quarter hours): should one ever reach
 * the domain it answers the same `platform.validation_failed` the schema would.
 */
const SCHEMA_RULES: ReadonlySet<AllocationRule> = new Set<AllocationRule>([
  'hours_not_positive',
  'hours_not_quarter_hour',
]);

/** Which code a broken rule answers with, most fundamental first when several break at once. */
const RULE_CODES = [
  {
    code: SchedulingErrorCodes.notALeaveProject,
    rules: ['not_a_leave_project'],
    message: () => 'Leave can only be booked on a leave-type project',
  },
  {
    code: SchedulingErrorCodes.invalidAllocation,
    rules: ['end_before_start', 'hours_over_24_per_day', 'hours_over_24_per_working_day'],
    message: (rules: ReadonlyArray<AllocationRule>) =>
      rules.includes('end_before_start')
        ? 'The end date is before the start date'
        : 'An allocation can take at most 24 hours a working day',
  },
  {
    code: SchedulingErrorCodes.pastNotRewritable,
    rules: ['starts_before_today', 'ends_before_today'],
    message: () => 'Past plans are not rewritten; only today onwards can change',
  },
  {
    code: SchedulingErrorCodes.outsideEmploymentPeriod,
    rules: ['outside_employment_period'],
    message: (_: ReadonlyArray<AllocationRule>, last: string | null) =>
      last === null
        ? "The allocation falls outside the resource's employment period"
        : `The allocation falls outside the resource's employment period; the last date they can be allocated is ${last}`,
  },
  {
    code: SchedulingErrorCodes.pastProjectCloseDate,
    rules: ['past_project_close_date', 'close_date_before_today'],
    message: (_: ReadonlyArray<AllocationRule>, last: string | null) =>
      last === null
        ? "The allocation runs past the project's close date"
        : `The allocation runs past the project's close date; the last date it can be allocated is ${last}`,
  },
] as const satisfies ReadonlyArray<{
  code: string;
  rules: ReadonlyArray<AllocationRule>;
  message: (rules: ReadonlyArray<AllocationRule>, last: string | null) => string;
}>;

/** AC-09, AC-09b, AC-13, AC-15, AC-25: every rule the input breaks, under the most fundamental code. */
const allocationRulesBroken = ({ rules, lastBookableDate }: AllocationRulesBroken) => {
  const contractRules = rules.filter((r): r is ContractAllocationRule => !SCHEMA_RULES.has(r));
  const [first, ...rest] = contractRules;
  const match = RULE_CODES.find((entry) =>
    (entry.rules as ReadonlyArray<ContractAllocationRule>).some((r) => contractRules.includes(r)),
  );
  if (first === undefined || match === undefined) {
    const details: ValidationIssues = {
      issues: [{ path: 'rateMinutes', message: 'Hours must be above 0, in quarter hours' }],
    };
    return new Invalid({
      message: 'rateMinutes: Hours must be above 0, in quarter hours',
      code: 'platform.validation_failed',
      details,
    });
  }
  const details: AllocationRuleViolations = {
    rules: [first, ...rest],
    ...(lastBookableDate === null ? {} : { lastBookableDate }),
  };
  return new Invalid({
    message: match.message(contractRules, lastBookableDate),
    code: match.code,
    details,
  });
};

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
    case 'AllocationRulesBroken':
      return allocationRulesBroken(error);
    case 'ProjectClosed':
      return new Conflict({
        message: 'The project is closed and accepts no new, changed or removed allocations',
        code: SchedulingErrorCodes.projectClosed,
      });
    case 'EmployeeRecordNotFound':
      return new NotFound({
        resource: 'Employee record',
        id: error.employeeId,
        code: SchedulingErrorCodes.employeeRecordNotFound,
      });
    case 'ProjectNotFound':
      return new NotFound({
        resource: 'Project',
        id: error.projectId,
        code: SchedulingErrorCodes.projectNotFound,
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
