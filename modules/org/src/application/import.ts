import type { UserId } from '@arv/kernel';
import { Effect, Either, Option } from 'effect';
import {
  type EmployeeName,
  type EmployeeRecord,
  type EmployeeTerms,
  type EmployeeTermsInput,
  validateEmployeeTerms,
} from '../domain/employee-record';
import { ImportedRecordInvalid, type LoginAlreadyLinked } from '../domain/errors';
import { type NameKey, nameKey } from '../domain/name';
import type { Team, TeamName } from '../domain/team';
import { EmployeeRecordRepository, TeamRepository } from './ports';

/** An employee record as the spreadsheet gives it: terms may be missing (AC-06), no login. */
export interface ImportedEmployeeRecord extends EmployeeTermsInput {
  readonly fullName: EmployeeName;
  /** The team by name (matched ignoring case and surrounding spaces), or `null` for none. */
  readonly teamName: TeamName | null;
}

/** What the import creates in org (flow 13). */
export interface OrgImport {
  /** Teams to have, even if no record names them. */
  readonly teams: ReadonlyArray<TeamName>;
  readonly records: ReadonlyArray<ImportedEmployeeRecord>;
}

/** A team the import named: an existing one it matched, or one it created without a lead. */
export interface ImportedTeam {
  readonly team: Team;
  readonly created: boolean;
}

export interface OrgImported {
  /** One per distinct team name key, in order of first mention (`teams`, then the records). */
  readonly teams: ReadonlyArray<ImportedTeam>;
  /** The created records, in input order. */
  readonly records: ReadonlyArray<EmployeeRecord>;
}

/**
 * Flow 13, AC-30: creates the import's teams and employee records, stamped as changed by
 * `importedBy`. Runs inside the caller's `UnitOfWork` and opens none of its own, so it commits or
 * rolls back with the rest of the import (ADR-0006); called outside one, each write commits alone.
 *
 * - Every record's terms are checked against AC-20 before anything is written; the first broken
 *   one fails `ImportedRecordInvalid`. Missing contract hours or start date are allowed: the record
 *   is created incomplete (AC-06).
 * - A team whose name matches an existing team (ignoring case and surrounding spaces, AC-19d) is
 *   reused; the others are created without a team lead (data-model `team_lead_id`). A team created
 *   meanwhile under the same name fails `DuplicateTeamName`.
 * - No permission check: the caller's import use case has already checked all three (AC-33).
 */
export const importOrgRecords = (input: OrgImport, importedBy: UserId) =>
  Effect.gen(function* () {
    const checkedRecords: Array<{ record: ImportedEmployeeRecord; terms: EmployeeTerms }> = [];
    for (const [index, record] of input.records.entries()) {
      const checked = validateEmployeeTerms(record);
      if (Either.isLeft(checked)) {
        return yield* new ImportedRecordInvalid({
          index,
          fullName: record.fullName,
          violations: checked.left.violations,
        });
      }
      checkedRecords.push({ record, terms: checked.right });
    }

    const teamRepository = yield* TeamRepository;
    const records = yield* EmployeeRecordRepository;

    const names = new Map<NameKey, TeamName>();
    for (const name of [...input.teams, ...input.records.flatMap((r) => r.teamName ?? [])]) {
      if (!names.has(nameKey(name))) names.set(nameKey(name), name);
    }
    const teams = new Map<NameKey, ImportedTeam>();
    for (const [key, name] of names) {
      const existing = yield* teamRepository.findByNameKey(key);
      teams.set(
        key,
        Option.isSome(existing)
          ? { team: existing.value, created: false }
          : { team: yield* teamRepository.create({ name, teamLeadId: null }), created: true },
      );
    }

    const created: Array<EmployeeRecord> = [];
    for (const { record, terms } of checkedRecords) {
      const teamId =
        record.teamName === null ? null : (teams.get(nameKey(record.teamName))?.team.id ?? null);
      created.push(
        yield* records
          .create({ ...terms, fullName: record.fullName, userId: null, teamId }, importedBy)
          // No login is linked, so the one-login-one-record rule (AC-19b) cannot be broken.
          .pipe(Effect.catchTag('LoginAlreadyLinked', (e: LoginAlreadyLinked) => Effect.die(e))),
      );
    }

    return { teams: [...teams.values()], records: created } satisfies OrgImported;
  });
