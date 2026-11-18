import { Schema } from 'effect';
import { EmployeeRef, IsoDate, UserRef } from '../org/values';
import { ProjectType } from '../projects/projects';
import { PageQuery } from '../shared/page';

// The scheduling read views (openapi.yaml `getBoard`, `getFreeList`, `getMySchedule`,
// `getAllocation`, `listAllocationHistory`). Redacted fields are always present, as `null`
// (api-sync-report Notes): the web never receives what the viewer may not see.

/** Exact computed minutes (ADR-0009); may carry a fraction. Round only for display (OpenAPI `Minutes`). */
export const Minutes = Schema.Number.pipe(Schema.nonNegative());

/** OpenAPI `ProjectRef`. */
export const ProjectRef = Schema.Struct({
  id: Schema.UUID,
  name: Schema.String.pipe(Schema.maxLength(200)),
  type: ProjectType,
});
export type ProjectRef = typeof ProjectRef.Type;

/** `day` / `week` for work (AC-07); `full-day` for leave (AC-15). */
export const RatePeriod = Schema.Literal('day', 'week', 'full-day');
export type RatePeriod = typeof RatePeriod.Type;

/** OpenAPI `AllocationSegment`; `rateMinutes` is null only for `full-day`. */
export const AllocationSegment = Schema.Struct({
  startsOn: IsoDate,
  endsOn: IsoDate,
  rateMinutes: Schema.NullOr(Schema.Int.pipe(Schema.between(15, 10080), Schema.multipleOf(15))),
  ratePeriod: RatePeriod,
});
export type AllocationSegment = typeof AllocationSegment.Type;

/** OpenAPI `WeekMinutes`. */
export const WeekMinutes = Schema.Struct({ weekStart: IsoDate, minutes: Minutes });
export type WeekMinutes = typeof WeekMinutes.Type;

/** Exactly one per cell (AC-01, AC-06, AC-21b). */
export const CellState = Schema.Literal(
  'free',
  'partly-booked',
  'overbooked',
  'non-working',
  'incomplete-record',
  'needs-attention',
);
export type CellState = typeof CellState.Type;

/** OpenAPI `BoardCell`; `capacityMinutes` is null for an incomplete record (AC-06). */
export const BoardCell = Schema.Struct({
  weekStart: IsoDate,
  state: CellState,
  allocatedMinutes: Minutes,
  capacityMinutes: Schema.NullOr(Minutes),
  leaveDays: Schema.Int.pipe(Schema.between(0, 7)),
});
export type BoardCell = typeof BoardCell.Type;

/** OpenAPI `BoardAllocation`: `project` null for redacted leave (AC-29), `needsAttention` null when hidden (AC-22). */
export const BoardAllocation = Schema.Struct({
  id: Schema.UUID,
  project: Schema.NullOr(ProjectRef),
  away: Schema.Boolean,
  segments: Schema.Array(AllocationSegment),
  minutesPerWeek: Schema.Array(WeekMinutes),
  needsAttention: Schema.NullOr(Schema.Boolean),
  version: Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
  lastChangedBy: UserRef,
  lastChangedAt: Schema.Date,
});
export type BoardAllocation = typeof BoardAllocation.Type;

/** OpenAPI `BoardRow`; `employmentEnd` null when there is none or the viewer may not see it (AC-22). */
export const BoardRow = Schema.Struct({
  employee: EmployeeRef,
  employmentEnd: Schema.NullOr(IsoDate),
  incomplete: Schema.Boolean,
  cells: Schema.Array(BoardCell),
  allocations: Schema.Array(BoardAllocation),
});
export type BoardRow = typeof BoardRow.Type;

/** `getBoard` 200 (AC-01). */
export const Board = Schema.Struct({
  from: IsoDate,
  to: IsoDate,
  weeks: Schema.Array(IsoDate),
  rows: Schema.Array(BoardRow),
});
export type Board = typeof Board.Type;
export type BoardEncoded = typeof Board.Encoded;

/** `getMySchedule` 200 (AC-17). */
export const MySchedule = Schema.Struct({
  employee: EmployeeRef,
  from: IsoDate,
  to: IsoDate,
  weeks: Schema.Array(IsoDate),
  cells: Schema.Array(BoardCell),
  allocations: Schema.Array(BoardAllocation),
});
export type MySchedule = typeof MySchedule.Type;
export type MyScheduleEncoded = typeof MySchedule.Encoded;

/** OpenAPI `FreeListEntry`. */
export const FreeListEntry = Schema.Struct({
  employee: EmployeeRef,
  freeMinutesTotal: Minutes,
  freeMinutesPerWeek: Schema.Array(WeekMinutes),
});
export type FreeListEntry = typeof FreeListEntry.Type;

/** `getFreeList` 200 (AC-04, AC-06): most free first, incomplete records apart. */
export const FreeList = Schema.Struct({
  from: IsoDate,
  to: IsoDate,
  weeks: Schema.Array(IsoDate),
  items: Schema.Array(FreeListEntry),
  incompleteRecords: Schema.Array(EmployeeRef),
});
export type FreeList = typeof FreeList.Type;
export type FreeListEncoded = typeof FreeList.Encoded;

/** `getAllocation` 200 (US-05, AC-07b). */
export const Allocation = Schema.Struct({
  id: Schema.UUID,
  employee: EmployeeRef,
  project: Schema.NullOr(ProjectRef),
  away: Schema.Boolean,
  segments: Schema.NonEmptyArray(AllocationSegment),
  needsAttention: Schema.NullOr(Schema.Boolean),
  version: Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
  lastChangedBy: UserRef,
  lastChangedAt: Schema.Date,
  createdAt: Schema.Date,
});
export type Allocation = typeof Allocation.Type;
export type AllocationEncoded = typeof Allocation.Encoded;

export const ChangeKind = Schema.Literal('created', 'imported', 'changed', 'trimmed', 'removed');
export type ChangeKind = typeof ChangeKind.Type;

/** OpenAPI `AllocationHistoryEntry` (AC-16). */
export const AllocationHistoryEntry = Schema.Struct({
  id: Schema.UUID,
  allocationId: Schema.UUID,
  employee: EmployeeRef,
  project: Schema.NullOr(ProjectRef),
  away: Schema.Boolean,
  changeKind: ChangeKind,
  effectiveFrom: Schema.NullOr(IsoDate),
  before: Schema.NullOr(Schema.Array(AllocationSegment)),
  after: Schema.NullOr(Schema.Array(AllocationSegment)),
  changedBy: UserRef,
  createdAt: Schema.Date,
});
export type AllocationHistoryEntry = typeof AllocationHistoryEntry.Type;

/** `listAllocationHistory` 200: a cursor page, oldest first. */
export const AllocationHistoryPage = Schema.Struct({
  items: Schema.Array(AllocationHistoryEntry),
  hasNext: Schema.Boolean,
  hasPrev: Schema.Boolean,
  nextCursor: Schema.NullOr(Schema.UUID),
});
export type AllocationHistoryPage = typeof AllocationHistoryPage.Type;
export type AllocationHistoryPageEncoded = typeof AllocationHistoryPage.Encoded;

/** Number of week columns, 1 to 12, as a query string (OpenAPI `WindowWeeks`). */
const WindowWeeks = Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 12));

/**
 * The week window of the board and my schedule (OpenAPI `WindowFrom`, `WindowWeeks`, ADR-0002).
 * Whether `from` lies within 12 months back and 52 weeks ahead is the server's rule
 * (`scheduling.window_out_of_range`), since it depends on today.
 */
export const MyScheduleQuery = Schema.Struct({
  from: Schema.optional(IsoDate),
  weeks: Schema.optional(WindowWeeks),
});
export type MyScheduleQuery = typeof MyScheduleQuery.Type;

/** `getBoard` query: the window plus a team and / or project filter (AC-02). */
export const BoardQuery = Schema.Struct({
  ...MyScheduleQuery.fields,
  teamId: Schema.optional(Schema.UUID),
  projectId: Schema.optional(Schema.UUID),
});
export type BoardQuery = typeof BoardQuery.Type;

/**
 * `getFreeList` query (AC-04). Both arrive as raw strings: the server checks the ranges and that
 * each is a number, so every bad value answers with the one AC-05 message.
 */
export const FreeListQuery = Schema.Struct({ weeks: Schema.String, minFreeHours: Schema.String });
export type FreeListQuery = typeof FreeListQuery.Type;

/** `listAllocationHistory` query: the page. */
export const AllocationHistoryQuery = PageQuery;
export type AllocationHistoryQuery = typeof AllocationHistoryQuery.Type;

/** `allocationId` path parameter. */
export const AllocationIdPath = Schema.Struct({ allocationId: Schema.UUID });
