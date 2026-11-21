import {
  CapacityImpact,
  EmployeeRecordConflictDetails,
  EmployeeRecordRuleViolations,
  LoginAlreadyLinkedDetails,
  OrgErrorCodes,
} from '@arv/contracts/org';
import { Option, Schema } from 'effect';
import type { ApiFailure } from '~/shared/lib/api.server';
import {
  type EmployeeRecordActionResult,
  type FieldErrors,
  NONE,
  type RecordField,
  RULE_MESSAGE,
} from './employee-record';

/** The record form's fields as the api takes them; `null` clears, `undefined` leaves unchanged. */
export type RecordInput = {
  readonly fullName: string;
  readonly teamId: string | null;
  readonly contractMinutes: number | null;
  readonly workingDays: ReadonlyArray<1 | 2 | 3 | 4 | 5 | 6 | 7>;
  readonly employmentStart: string | null;
  readonly employmentEnd: string | null;
  /** Absent when the form could not offer logins (no access to the access list). */
  readonly userId?: string | null;
};

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const orNull = (value: string) => (value === '' || value === NONE ? null : value);

/**
 * Reads the record form. Hours are typed as hours and sent as minutes (ADR-0009); hours that are
 * not a number come back as a field error at once, everything else is the api's to judge (AC-20).
 */
export function readRecordForm(
  form: FormData,
): { ok: true; input: RecordInput } | { ok: false; fieldErrors: FieldErrors } {
  const hours = text(form, 'contractHours');
  const hoursNumber = Number(hours);
  if (hours !== '' && !Number.isFinite(hoursNumber)) {
    return { ok: false, fieldErrors: { contractHours: RULE_MESSAGE.contractHours } };
  }
  const workingDays = form
    .getAll('workingDay')
    .map(Number)
    .filter(
      (day): day is 1 | 2 | 3 | 4 | 5 | 6 | 7 => Number.isInteger(day) && day >= 1 && day <= 7,
    )
    .sort((a, b) => a - b);
  return {
    ok: true,
    input: {
      fullName: text(form, 'fullName'),
      teamId: orNull(text(form, 'teamId')),
      contractMinutes: hours === '' ? null : Math.round(hoursNumber * 60),
      workingDays,
      employmentStart: orNull(text(form, 'employmentStart')),
      employmentEnd: orNull(text(form, 'employmentEnd')),
      ...(form.has('userId') ? { userId: orNull(text(form, 'userId')) } : {}),
    },
  };
}

/** Which form input a contract field's validation issue belongs under, with its words. */
const ISSUE_FIELD: Record<string, { field: RecordField; message: string }> = {
  fullName: { field: 'fullName', message: RULE_MESSAGE.fullName },
  contractMinutes: { field: 'contractHours', message: RULE_MESSAGE.contractHours },
  workingDays: { field: 'workingDays', message: RULE_MESSAGE.workingDays },
  employmentStart: { field: 'employmentStart', message: RULE_MESSAGE.date },
  employmentEnd: { field: 'employmentEnd', message: RULE_MESSAGE.date },
};

const ValidationIssues = Schema.Struct({
  issues: Schema.Array(Schema.Struct({ path: Schema.String, message: Schema.String })),
});

const decodeIssues = Schema.decodeUnknownOption(ValidationIssues);
const decodeRules = Schema.decodeUnknownOption(EmployeeRecordRuleViolations);
const decodeLinked = Schema.decodeUnknownOption(LoginAlreadyLinkedDetails);
const decodeImpact = Schema.decodeUnknownOption(CapacityImpact);
const decodeConflict = Schema.decodeUnknownOption(EmployeeRecordConflictDetails);

const invalid = (fieldErrors: FieldErrors, error?: string): EmployeeRecordActionResult => ({
  ok: false,
  kind: 'invalid',
  fieldErrors,
  ...(error ? { error } : {}),
});

/** One rule per field, in the design's words (AC-20); issues on no known field go to `error`. */
function validationFailure(details: unknown, message: string): EmployeeRecordActionResult {
  const issues = Option.getOrElse(
    Option.map(decodeIssues(details), (d) => d.issues),
    () => [],
  );
  const fieldErrors: FieldErrors = {};
  const other: string[] = [];
  for (const issue of issues) {
    const known = ISSUE_FIELD[issue.path.split('.')[0] ?? ''];
    if (known) fieldErrors[known.field] ??= known.message;
    else other.push(issue.message);
  }
  const hasField = Object.keys(fieldErrors).length > 0;
  return invalid(fieldErrors, other.length > 0 || !hasField ? (other[0] ?? message) : undefined);
}

/**
 * An api refusal as the record dialog shows it: rule errors under their fields (AC-20), the
 * record a login already belongs to (AC-19b), the weeks to confirm (AC-19c), or the values someone
 * else saved meanwhile. 401/403 are the route's to turn into the refusal screens.
 */
export function recordFailure(failed: ApiFailure): EmployeeRecordActionResult {
  switch (failed.code) {
    case 'platform.validation_failed':
      return validationFailure(failed.details, failed.message);
    case OrgErrorCodes.invalidEmployeeRecord:
      return Option.isSome(decodeRules(failed.details))
        ? invalid({ employmentEnd: RULE_MESSAGE.endBeforeStart })
        : invalid({}, failed.message);
    case OrgErrorCodes.loginAlreadyLinked:
      return Option.match(decodeLinked(failed.details), {
        onNone: () => invalid({ userId: failed.message }),
        onSome: ({ employeeRecord }) =>
          invalid({ userId: RULE_MESSAGE.loginLinked(employeeRecord.fullName) }),
      });
    case OrgErrorCodes.userNotFound:
      return invalid({ userId: RULE_MESSAGE.loginGone });
    case OrgErrorCodes.teamNotFound:
      return invalid({ teamId: RULE_MESSAGE.teamGone });
    case OrgErrorCodes.capacityConfirmationRequired:
      return Option.match(decodeImpact(failed.details), {
        onNone: () => ({ ok: false, kind: 'error', error: failed.message }),
        onSome: ({ overbookedWeeks }) => ({
          ok: false,
          kind: 'confirm',
          weeks: overbookedWeeks.map((week) => ({
            employeeName: week.employee.fullName,
            weekStart: week.weekStart,
            overMinutes: week.overMinutes,
          })),
        }),
      });
    case OrgErrorCodes.versionConflict:
      return Option.match(decodeConflict(failed.details), {
        onNone: () => ({ ok: false, kind: 'error', error: failed.message }),
        onSome: ({ current }) => ({ ok: false, kind: 'conflict', error: failed.message, current }),
      });
    default:
      return { ok: false, kind: 'error', error: failed.message };
  }
}
