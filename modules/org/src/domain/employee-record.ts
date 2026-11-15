import { EmployeeId, UserId } from '@arv/kernel';
import { Either, Schema } from 'effect';
import {
  CalendarDate,
  DEFAULT_WORKING_DAYS,
  type IsoWeekday,
  normaliseWorkingDays,
  WorkingDays,
} from './calendar';
import {
  ContractHoursOutOfRange,
  type EmployeeRecordRuleViolation,
  EmploymentEndsBeforeStart,
  InvalidEmployeeRecord,
  NoWorkingDay,
} from './errors';
import { trimmedName } from './name';
import { TeamId } from './team';

export const EMPLOYEE_NAME_MAX_LENGTH = 200;

/** Contract hours are stored as minutes per week (ADR-0009); at most 60 hours (AC-20). */
export const MAX_CONTRACT_MINUTES = 60 * 60;

/** A whole number of minutes per week, above 0 and at most 3600 (60 hours, AC-20). */
export const ContractMinutes = Schema.Int.pipe(
  Schema.greaterThan(0),
  Schema.lessThanOrEqualTo(MAX_CONTRACT_MINUTES),
);

/** An employee's full name: trimmed, non-empty, at most 200 characters. Decoding trims. */
export const EmployeeName = trimmedName(EMPLOYEE_NAME_MAX_LENGTH, 'EmployeeName');
export type EmployeeName = typeof EmployeeName.Type;

/** The terms that decide capacity (AC-19). Missing contract hours or start = incomplete (AC-06). */
export interface EmployeeTerms {
  readonly contractMinutes: number | null;
  readonly workingDays: ReadonlyArray<IsoWeekday>;
  readonly employmentStart: CalendarDate | null;
  readonly employmentEnd: CalendarDate | null;
}

/** Terms as entered; working days left out default to Monday–Friday (AC-06). */
export interface EmployeeTermsInput {
  readonly contractMinutes: number | null;
  readonly workingDays?: ReadonlyArray<IsoWeekday> | undefined;
  readonly employmentStart: CalendarDate | null;
  readonly employmentEnd: CalendarDate | null;
}

/**
 * Checks the AC-20 rules — contract hours above 0 and at most 60 a week (in whole minutes), at
 * least one working day, end not before start — and reports every rule broken at once. On success
 * the terms come back normalised: working days defaulted and sorted without repeats. Missing
 * contract hours or start date are allowed; they make the record incomplete (AC-06), not invalid.
 */
export const validateEmployeeTerms = (
  input: EmployeeTermsInput,
): Either.Either<EmployeeTerms, InvalidEmployeeRecord> => {
  const workingDays = normaliseWorkingDays(input.workingDays ?? DEFAULT_WORKING_DAYS);
  const { contractMinutes, employmentStart, employmentEnd } = input;
  const violations: EmployeeRecordRuleViolation[] = [];
  if (contractMinutes !== null && !Schema.is(ContractMinutes)(contractMinutes)) {
    violations.push(new ContractHoursOutOfRange({ contractMinutes }));
  }
  if (workingDays.length === 0) violations.push(new NoWorkingDay());
  if (employmentStart !== null && employmentEnd !== null && employmentEnd < employmentStart) {
    violations.push(new EmploymentEndsBeforeStart({ employmentStart, employmentEnd }));
  }
  const [first, ...rest] = violations;
  return first === undefined
    ? Either.right({ contractMinutes, workingDays, employmentStart, employmentEnd })
    : Either.left(new InvalidEmployeeRecord({ violations: [first, ...rest] }));
};

/**
 * AC-06: capacity is unknown without contract hours or a start date, so the resource is marked
 * «incomplete record» and left off the free list. Working days and team never make it incomplete.
 */
export const isIncomplete = (
  terms: Pick<EmployeeTerms, 'contractMinutes' | 'employmentStart'>,
): boolean => terms.contractMinutes === null || terms.employmentStart === null;

/**
 * The intranet's shared record of an employee (sad glossary), owned by `org`. Its terms are not
 * effective-dated: a change rewrites capacity for every week (data-model, 2026-10-30 decision).
 */
export class EmployeeRecord extends Schema.Class<EmployeeRecord>('EmployeeRecord')({
  id: EmployeeId,
  fullName: Schema.String,
  /** The linked intranet login (identity user); one login → one record (AC-19b). */
  userId: Schema.NullOr(UserId),
  /** No team = grouped under «no team» (AC-06). */
  teamId: Schema.NullOr(TeamId),
  contractMinutes: Schema.NullOr(ContractMinutes),
  workingDays: WorkingDays,
  employmentStart: Schema.NullOr(CalendarDate),
  employmentEnd: Schema.NullOr(CalendarDate),
  /** Optimistic concurrency (sad §8); 1 on insert. */
  version: Schema.Int.pipe(Schema.positive()),
  lastChangedBy: UserId,
  lastChangedAt: Schema.DateFromSelf,
  createdAt: Schema.DateFromSelf,
}) {
  /** AC-06: no contract hours or no start date yet. */
  get isIncomplete(): boolean {
    return isIncomplete(this);
  }
}

/**
 * `org.version_conflict`: the record changed since the form was opened. Carries the current
 * values, including who changed them (sad §8, flow 9). Lives here, not in `errors.ts`, because it
 * embeds the entity.
 */
export class EmployeeRecordVersionConflict extends Schema.TaggedError<EmployeeRecordVersionConflict>()(
  'EmployeeRecordVersionConflict',
  { current: EmployeeRecord },
) {}

/** Succeeds with `record` only when it is still at the `expected` version the edit started from. */
export const checkVersion = (
  record: EmployeeRecord,
  expected: number,
): Either.Either<EmployeeRecord, EmployeeRecordVersionConflict> =>
  record.version === expected
    ? Either.right(record)
    : Either.left(new EmployeeRecordVersionConflict({ current: record }));
