import type { EmployeeId, UserId } from '@arv/kernel';
import { Context, type Effect, type Option } from 'effect';
import type { CalendarDate } from '../domain/calendar';
import type { EmployeeName, EmployeeRecord, EmployeeTerms } from '../domain/employee-record';
import type { DuplicateHolidayDate, DuplicateTeamName, LoginAlreadyLinked } from '../domain/errors';
import type { NameKey } from '../domain/name';
import type { HolidayName, PublicHoliday, PublicHolidayId } from '../domain/public-holiday';
import type { Team, TeamId, TeamName } from '../domain/team';

// Outbound ports (`Context.Tag`s) the use cases need. Adapters live in `infrastructure/`. Ports
// have no database error channel: adapters turn DB failures into defects (`Effect.orDie`). Every
// adapter joins an open `UnitOfWork`, so multi-write use cases wrap their calls in one.

/** What an employee record is created or replaced from; terms already validated (AC-20). */
export interface EmployeeRecordInput extends EmployeeTerms {
  readonly fullName: EmployeeName;
  /** The intranet login to link, or `null` for none (AC-19a, AC-19b). */
  readonly userId: UserId | null;
  readonly teamId: TeamId | null;
}

/** Employee records (AC-19a, AC-19b). Writes stamp «last changed by» and bump the version. */
export class EmployeeRecordRepository extends Context.Tag('org/EmployeeRecordRepository')<
  EmployeeRecordRepository,
  {
    /** Every record, by full name. */
    readonly list: () => Effect.Effect<ReadonlyArray<EmployeeRecord>>;
    /** The records among `ids`, by full name; unknown ids are skipped. */
    readonly listByIds: (
      ids: ReadonlyArray<EmployeeId>,
    ) => Effect.Effect<ReadonlyArray<EmployeeRecord>>;
    /** The records in the team, by full name (board filter, AC-02). */
    readonly listByTeam: (teamId: TeamId) => Effect.Effect<ReadonlyArray<EmployeeRecord>>;
    readonly findById: (id: EmployeeId) => Effect.Effect<Option.Option<EmployeeRecord>>;
    /** The record linked to the login, if any (flow 8, AC-18). */
    readonly findByUserId: (userId: UserId) => Effect.Effect<Option.Option<EmployeeRecord>>;
    /**
     * Inserts the record at version 1. A login already linked to another record fails
     * `LoginAlreadyLinked`, naming that record (AC-19b).
     */
    readonly create: (
      input: EmployeeRecordInput,
      changedBy: UserId,
    ) => Effect.Effect<EmployeeRecord, LoginAlreadyLinked>;
    /**
     * Replaces the record only while it is still at `expectedVersion`, and bumps the version.
     * `None` when no row matched: the record changed meanwhile or is gone (sad §8 Concurrency);
     * the use case re-reads it to tell the two apart. A login already linked to another record
     * fails `LoginAlreadyLinked` (AC-19b).
     */
    readonly update: (
      id: EmployeeId,
      expectedVersion: number,
      input: EmployeeRecordInput,
      changedBy: UserId,
    ) => Effect.Effect<Option.Option<EmployeeRecord>, LoginAlreadyLinked>;
  }
>() {}

/** A team with the number of resources in it (AC-19d: removal is refused while it has any). */
export interface TeamWithMemberCount {
  readonly team: Team;
  readonly memberCount: number;
}

/** What a team is created from. */
export interface TeamInput {
  readonly name: TeamName;
  readonly teamLeadId: EmployeeId | null;
}

/** Teams (AC-19d). Last write wins; names are unique by `nameKey`. */
export class TeamRepository extends Context.Tag('org/TeamRepository')<
  TeamRepository,
  {
    /** Every team with its member count, by name. */
    readonly list: () => Effect.Effect<ReadonlyArray<TeamWithMemberCount>>;
    readonly findById: (id: TeamId) => Effect.Effect<Option.Option<TeamWithMemberCount>>;
    readonly findByNameKey: (key: NameKey) => Effect.Effect<Option.Option<Team>>;
    /** A taken name key fails `DuplicateTeamName` (AC-19d). */
    readonly create: (input: TeamInput) => Effect.Effect<Team, DuplicateTeamName>;
    /** Changes only the name; `None` when the team is gone. A taken name key fails. */
    readonly rename: (
      id: TeamId,
      name: TeamName,
    ) => Effect.Effect<Option.Option<Team>, DuplicateTeamName>;
    /** Deletes the team; `false` when it was gone. The use case checks it is empty first. */
    readonly delete: (id: TeamId) => Effect.Effect<boolean>;
  }
>() {}

/** What a public holiday is added from. */
export interface PublicHolidayInput {
  readonly holidayDate: CalendarDate;
  readonly name: HolidayName;
}

/** The single company-wide public-holiday list (US-09). Last write wins. */
export class PublicHolidayRepository extends Context.Tag('org/PublicHolidayRepository')<
  PublicHolidayRepository,
  {
    /** Holidays from `from` to `to`, both included, by date (AC-27). */
    readonly listInRange: (
      from: CalendarDate,
      to: CalendarDate,
    ) => Effect.Effect<ReadonlyArray<PublicHoliday>>;
    readonly findById: (id: PublicHolidayId) => Effect.Effect<Option.Option<PublicHoliday>>;
    /** A date already on the list fails `DuplicateHolidayDate` (US-09). */
    readonly create: (
      input: PublicHolidayInput,
    ) => Effect.Effect<PublicHoliday, DuplicateHolidayDate>;
    /** Hard delete; `false` when it was gone. */
    readonly delete: (id: PublicHolidayId) => Effect.Effect<boolean>;
  }
>() {}
