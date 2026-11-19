import type { EmployeeId, ProjectId, UserId } from '@arv/kernel';
import { Context, type Effect, type Option } from 'effect';
import type {
  Allocation,
  AllocationId,
  HistoryEntry,
  IsoDate,
  Segment,
} from '../domain/allocation';
import type { AllocationNotFound, AllocationVersionConflict } from '../domain/errors';

// Outbound ports (`Context.Tag`s) the use cases need. Adapters live in `infrastructure/`. Ports
// have no database error channel: adapters turn DB failures into defects (`Effect.orDie`). Every
// adapter joins an open `UnitOfWork`, so a command writes the allocation, its segments and its
// history entry in one transaction (ADR-0006).

/** An allocation as stored: the aggregate plus «last changed by» with the time (AC-07), and when it was created. */
export interface StoredAllocation {
  readonly allocation: Allocation;
  readonly lastChangedBy: UserId;
  readonly lastChangedAt: Date;
  readonly createdAt: Date;
}

/** What a new allocation is stored from: its first segments, already checked by the domain. */
export interface NewAllocation {
  readonly employeeId: EmployeeId;
  readonly projectId: ProjectId;
  readonly segments: readonly [Segment, ...Segment[]];
}

/** A window of business dates, both included. */
export interface DateWindow {
  readonly from: IsoDate;
  readonly to: IsoDate;
}

/** Narrows a window read to some resources and / or one project (board filters, AC-02). */
export interface WindowFilter {
  /** Only these resources; an empty list matches nothing. Left out: every resource. */
  readonly employeeIds?: ReadonlyArray<EmployeeId>;
  readonly projectId?: ProjectId;
}

/**
 * An allocation seen through a window: only its segments that overlap the window, in order
 * (never empty). Satisfies the domain's `ScheduledAllocation`.
 */
export interface AllocationInWindow {
  readonly id: AllocationId;
  readonly employeeId: EmployeeId;
  readonly projectId: ProjectId;
  readonly version: number;
  readonly lastChangedBy: UserId;
  readonly lastChangedAt: Date;
  readonly segments: ReadonlyArray<Segment>;
}

/**
 * The Allocation aggregate with its effective-dated segments (ADR-0008). Writes stamp «last
 * changed by» and are guarded by the version the user opened (AC-07b): a stale version fails
 * `AllocationVersionConflict` with the stored one, a missing allocation `AllocationNotFound`.
 */
export class AllocationRepository extends Context.Tag('scheduling/AllocationRepository')<
  AllocationRepository,
  {
    /** The allocation with all its segments, in order. */
    readonly findById: (id: AllocationId) => Effect.Effect<Option.Option<StoredAllocation>>;
    /**
     * Allocations with at least one segment overlapping `window` (`ends_on >= from AND starts_on
     * <= to`), each with only those segments; by resource, then project, then id.
     */
    readonly listInWindow: (
      window: DateWindow,
      filter?: WindowFilter,
    ) => Effect.Effect<ReadonlyArray<AllocationInWindow>>;
    /** Inserts the allocation at version 1 with its segments. */
    readonly insert: (input: NewAllocation, changedBy: UserId) => Effect.Effect<StoredAllocation>;
    /**
     * Inserts many allocations at version 1 with their segments, in a few batched statements (the
     * one-time import, flow 13). Returns their ids in input order. No overbooking check: the
     * caller's use case has shown it already (AC-30).
     */
    readonly insertMany: (
      inputs: ReadonlyArray<NewAllocation>,
      changedBy: UserId,
    ) => Effect.Effect<ReadonlyArray<AllocationId>>;
    /**
     * Stores `segments` as the allocation's segments while it is still at `expectedVersion`, and
     * bumps the version. Segments already stored unchanged (the past, AC-09b) keep their rows;
     * the others are replaced.
     */
    readonly update: (
      id: AllocationId,
      expectedVersion: number,
      segments: readonly [Segment, ...Segment[]],
      changedBy: UserId,
    ) => Effect.Effect<StoredAllocation, AllocationVersionConflict | AllocationNotFound>;
    /**
     * Deletes the allocation and its segments while it is still at `expectedVersion` (AC-07a).
     * Its history stays: `allocation_history` has no foreign key to it.
     */
    readonly delete: (
      id: AllocationId,
      expectedVersion: number,
    ) => Effect.Effect<void, AllocationVersionConflict | AllocationNotFound>;
  }
>() {}

/** A history entry to record: what the domain returned plus who the change is about and by. */
export interface NewHistoryEntry {
  readonly allocationId: AllocationId;
  readonly employeeId: EmployeeId;
  readonly projectId: ProjectId;
  readonly entry: HistoryEntry;
  readonly changedBy: UserId;
}

/** A recorded history entry; `createdAt` is when the change happened (AC-16). */
export interface StoredHistoryEntry extends NewHistoryEntry {
  readonly id: string;
  readonly createdAt: Date;
}

/** The allocation change history, kept 12 months then purged (AC-16, AC-07a). Append-only. */
export class AllocationHistoryRepository extends Context.Tag(
  'scheduling/AllocationHistoryRepository',
)<
  AllocationHistoryRepository,
  {
    readonly append: (entry: NewHistoryEntry) => Effect.Effect<void>;
    /** Appends many entries in a few batched statements (the one-time import, flow 13). */
    readonly appendMany: (entries: ReadonlyArray<NewHistoryEntry>) => Effect.Effect<void>;
    /** The allocation's entries recorded at or after `since`, oldest first. */
    readonly listForAllocation: (
      allocationId: AllocationId,
      since: Date,
    ) => Effect.Effect<ReadonlyArray<StoredHistoryEntry>>;
    /** Deletes the entries recorded before `cutOff`; returns how many. Idempotent. */
    readonly deleteBefore: (cutOff: Date) => Effect.Effect<number>;
    /** When the oldest remaining entry was recorded; `null` when there is none (retention report). */
    readonly oldestCreatedAt: () => Effect.Effect<Date | null>;
  }
>() {}

/** The report of a completed spreadsheet import (US-11, AC-30). */
export interface ImportRunInput {
  readonly importedBy: UserId;
  readonly employeeRecordsCreated: number;
  readonly projectsCreated: number;
  readonly allocationsCreated: number;
}

/** A completed import run as stored (contract `ImportResult`, by user id). */
export interface StoredImportRun extends ImportRunInput {
  readonly id: string;
  readonly createdAt: Date;
}

/**
 * Completed import runs: at most one ever (AC-32). The use case reads `findCompleted` first; the
 * unique index is the backstop for two concurrent imports, whose loser's transaction rolls back.
 */
export class ImportRunRepository extends Context.Tag('scheduling/ImportRunRepository')<
  ImportRunRepository,
  {
    /** The completed run, if the import has happened. */
    readonly findCompleted: () => Effect.Effect<Option.Option<StoredImportRun>>;
    /** Records the completed run; a second one is a defect (the one-time unique index). */
    readonly insert: (input: ImportRunInput) => Effect.Effect<StoredImportRun>;
  }
>() {}
