import type { EmployeeId, UserId } from '@arv/kernel';
import { Context, Effect, Layer, Option } from 'effect';
import type { CalendarDate, IsoWeekday } from '../domain/calendar';
import type { EmployeeRecord } from '../domain/employee-record';
import type { DuplicateTeamName, ImportedRecordInvalid } from '../domain/errors';
import type { TeamId } from '../domain/team';
import { importOrgRecords, type OrgImport } from './import';
import { EmployeeRecordRepository, PublicHolidayRepository, TeamRepository } from './ports';

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

/** A team as other modules name it (e.g. projects' closing preview, AC-25). */
export interface TeamRef {
  readonly id: TeamId;
  readonly name: string;
}

/** A team the import named: an existing one it matched, or one it created (flow 13). */
export interface ImportedTeamRef extends TeamRef {
  readonly created: boolean;
}

/** A date range, both ends included. */
export interface DateWindow {
  readonly from: CalendarDate;
  readonly to: CalendarDate;
}

/**
 * Facade for other modules (scheduling). No permission check here — the caller's own use case has
 * already decided what the actor may see or do. Reads, plus the import command, which joins the
 * caller's `UnitOfWork` (ADR-0006). Add a method only when another module needs it.
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
    /** The teams among `teamIds` (unknown ids skipped), by name (closing preview, AC-25). */
    readonly teamsByIds: (teamIds: ReadonlyArray<TeamId>) => Effect.Effect<ReadonlyArray<TeamRef>>;
    /**
     * Import command (flow 13, AC-30): creates the teams (matching existing ones by name, the rest
     * without a lead) and the employee records (incomplete allowed, AC-06), stamped as changed by
     * `importedBy`. Opens no transaction: call it inside the import's `UnitOfWork`, so it commits or
     * rolls back with the rest. Teams come back once per distinct name, records in input order.
     */
    readonly importRecords: (
      input: OrgImport,
      importedBy: UserId,
    ) => Effect.Effect<
      {
        readonly teams: ReadonlyArray<ImportedTeamRef>;
        readonly records: ReadonlyArray<ResourceTerms>;
      },
      ImportedRecordInvalid | DuplicateTeamName
    >;
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
    const teams = yield* TeamRepository;
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
      teamsByIds: (teamIds) =>
        teamIds.length === 0
          ? Effect.succeed([])
          : teams
              .list()
              .pipe(
                Effect.map((rows) =>
                  rows
                    .filter(({ team }) => teamIds.includes(team.id))
                    .map(({ team }) => ({ id: team.id, name: team.name })),
                ),
              ),
      importRecords: (input, importedBy) =>
        importOrgRecords(input, importedBy).pipe(
          Effect.provideService(EmployeeRecordRepository, records),
          Effect.provideService(TeamRepository, teams),
          Effect.map((imported) => ({
            teams: imported.teams.map(({ team, created }) => ({
              id: team.id,
              name: team.name,
              created,
            })),
            records: imported.records.map(toResourceTerms),
          })),
        ),
    };
  }),
);
