import type { EmployeeId, UserId } from '@arv/kernel';
import { Context, Effect, Layer, Option } from 'effect';
import type { CalendarDate, IsoWeekday } from '../domain/calendar';
import type { EmployeeRecord } from '../domain/employee-record';
import type { TeamId } from '../domain/team';
import { EmployeeRecordRepository, PublicHolidayRepository } from './ports';

/**
 * A resource as scheduling computes capacity from it (ADR-0005). Carries the employment end date
 * unredacted: who may see it is decided by scheduling's visibility policy and the presenters
 * (AC-22), never here.
 */
export interface ResourceTerms {
  readonly employeeId: EmployeeId;
  readonly fullName: string;
  readonly userId: UserId | null;
  readonly teamId: TeamId | null;
  /** Null on an incomplete record (AC-06), like `employmentStart`. */
  readonly contractMinutes: number | null;
  readonly workingDays: ReadonlyArray<IsoWeekday>;
  readonly employmentStart: CalendarDate | null;
  readonly employmentEnd: CalendarDate | null;
}

/** A company-wide non-working date (US-09). */
export interface Holiday {
  readonly holidayDate: CalendarDate;
  readonly name: string;
}

/** A date range, both ends included. */
export interface DateWindow {
  readonly from: CalendarDate;
  readonly to: CalendarDate;
}

/**
 * Facade for other modules (scheduling). Reads only: no permission check here — the caller's
 * own use case has already decided what the actor may see. Add a method only when another module
 * needs it.
 */
export class OrgApi extends Context.Tag('org/OrgApi')<
  OrgApi,
  {
    /**
     * The terms of the resources among `employeeIds` (unknown ids skipped, by full name) and the
     * public holidays in `window` — everything capacity needs for those weeks (AC-19, AC-27).
     */
    readonly employmentTerms: (
      employeeIds: ReadonlyArray<EmployeeId>,
      window: DateWindow,
    ) => Effect.Effect<{
      readonly resources: ReadonlyArray<ResourceTerms>;
      readonly holidays: ReadonlyArray<Holiday>;
    }>;
    /**
     * The resources whose employment period overlaps `window` — or whose start is still unknown
     * (incomplete record, AC-06) — optionally only those in `teamId`, by full name, with the
     * public holidays in `window` (board rows, AC-01, AC-02; free list, AC-04).
     */
    readonly employedIn: (
      window: DateWindow,
      teamId?: TeamId,
    ) => Effect.Effect<{
      readonly resources: ReadonlyArray<ResourceTerms>;
      readonly holidays: ReadonlyArray<Holiday>;
    }>;
    /** The resource linked to the login, if any (flow 8; `None` → AC-18). */
    readonly employeeByLogin: (userId: UserId) => Effect.Effect<Option.Option<ResourceTerms>>;
    /** The resources in the team, by full name (board team filter, AC-02). */
    readonly resourcesInTeam: (teamId: TeamId) => Effect.Effect<ReadonlyArray<ResourceTerms>>;
  }
>() {}

/** Employed on some day of `window`; an unknown start counts as overlapping (AC-06). */
const overlaps = (record: EmployeeRecord, window: DateWindow): boolean =>
  (record.employmentStart === null || record.employmentStart <= window.to) &&
  (record.employmentEnd === null || record.employmentEnd >= window.from);

const toResourceTerms = (record: EmployeeRecord): ResourceTerms => ({
  employeeId: record.id,
  fullName: record.fullName,
  userId: record.userId,
  teamId: record.teamId,
  contractMinutes: record.contractMinutes,
  workingDays: record.workingDays,
  employmentStart: record.employmentStart,
  employmentEnd: record.employmentEnd,
});

export const OrgApiLive = Layer.effect(
  OrgApi,
  Effect.gen(function* () {
    const records = yield* EmployeeRecordRepository;
    const holidays = yield* PublicHolidayRepository;
    return {
      employmentTerms: (employeeIds, window) =>
        // Sequential: inside a caller's UnitOfWork both run on one transaction connection.
        Effect.all({
          resources: records.listByIds(employeeIds),
          holidays: holidays.listInRange(window.from, window.to),
        }).pipe(
          Effect.map((found) => ({
            resources: found.resources.map(toResourceTerms),
            holidays: found.holidays.map(({ holidayDate, name }) => ({ holidayDate, name })),
          })),
        ),
      employedIn: (window, teamId) =>
        Effect.all({
          resources: teamId === undefined ? records.list() : records.listByTeam(teamId),
          holidays: holidays.listInRange(window.from, window.to),
        }).pipe(
          Effect.map((found) => ({
            resources: found.resources
              .filter((record) => overlaps(record, window))
              .map(toResourceTerms),
            holidays: found.holidays.map(({ holidayDate, name }) => ({ holidayDate, name })),
          })),
        ),
      employeeByLogin: (userId) =>
        records.findByUserId(userId).pipe(Effect.map(Option.map(toResourceTerms))),
      resourcesInTeam: (teamId) =>
        records.listByTeam(teamId).pipe(Effect.map((rows) => rows.map(toResourceTerms))),
    };
  }),
);
