import {
  type CapacityImpact,
  EmployeeRecord,
  EmployeeRecordConflictDetails,
  EmployeeRecordPage,
  type EmployeeRecordRuleViolations,
  type LoginAlreadyLinkedDetails,
  OrgErrorCodes,
} from '@arv/contracts/org';
import { ConfirmationRequired, Conflict, Invalid, NotFound } from '@arv/contracts/shared';
import { Schema } from 'effect';
import type { EmployeeRecordView, EmployeeRef, Page } from '../application/employee-records';
import type { EmployeeRecordVersionConflict } from '../domain/employee-record';
import type {
  CapacityConfirmationRequired,
  EmployeeRecordNotFound,
  EmployeeRecordRuleViolation,
  InvalidEmployeeRecord,
  LoginAlreadyLinked,
  OverbookedWeek,
  TeamNotFound,
  UserNotFound,
} from '../domain/errors';

// Domain → contract DTO (`Schema.encodeSync`) and domain error → shared contract error. Messages
// are the contract's (openapi.yaml `components.examples`).

/** Shown when the login that last changed a record has since been removed from the intranet. */
const FORMER_USER = 'Former user';

const toEmployeeRecordDto = ({ record, team, lastChangedBy }: EmployeeRecordView) => ({
  id: record.id,
  fullName: record.fullName,
  userId: record.userId,
  team,
  contractMinutes: record.contractMinutes,
  workingDays: record.workingDays,
  employmentStart: record.employmentStart,
  // Every employee-record endpoint requires `org:manage-employee-records`, which entitles the
  // caller to the end date, so it is never redacted here (AC-22, sad §8 Visibility).
  employmentEnd: record.employmentEnd,
  incomplete: record.isIncomplete,
  version: record.version,
  lastChangedBy: { id: lastChangedBy.id, name: lastChangedBy.name ?? FORMER_USER },
  lastChangedAt: record.lastChangedAt,
  createdAt: record.createdAt,
});

/** OpenAPI `EmployeeRecord`. */
export const presentEmployeeRecord = (view: EmployeeRecordView) =>
  Schema.encodeSync(EmployeeRecord)(toEmployeeRecordDto(view));

/** OpenAPI `EmployeeRecordPage`. */
export const presentEmployeeRecordPage = (page: Page<EmployeeRecordView>) =>
  Schema.encodeSync(EmployeeRecordPage)({ ...page, items: page.items.map(toEmployeeRecordDto) });

/** The employee-record failures that map without looking anything up. */
export type EmployeeRecordError =
  | InvalidEmployeeRecord
  | EmployeeRecordNotFound
  | UserNotFound
  | TeamNotFound;

/** The employee-record failures whose contract body names more than the error carries. */
export type DescribedEmployeeRecordError =
  | LoginAlreadyLinked
  | EmployeeRecordVersionConflict
  | CapacityConfirmationRequired;

const EMPLOYEE_RECORD_ERROR_TAGS: ReadonlySet<string> = new Set<EmployeeRecordError['_tag']>([
  'InvalidEmployeeRecord',
  'EmployeeRecordNotFound',
  'UserNotFound',
  'TeamNotFound',
]);

const DESCRIBED_ERROR_TAGS: ReadonlySet<string> = new Set<DescribedEmployeeRecordError['_tag']>([
  'LoginAlreadyLinked',
  'EmployeeRecordVersionConflict',
  'CapacityConfirmationRequired',
]);

export const isEmployeeRecordError = (error: {
  readonly _tag: string;
}): error is EmployeeRecordError => EMPLOYEE_RECORD_ERROR_TAGS.has(error._tag);

export const isDescribedEmployeeRecordError = (error: {
  readonly _tag: string;
}): error is DescribedEmployeeRecordError => DESCRIBED_ERROR_TAGS.has(error._tag);

const VIOLATION_FIELD: Record<EmployeeRecordRuleViolation['_tag'], string> = {
  ContractHoursOutOfRange: 'contractMinutes',
  NoWorkingDay: 'workingDays',
  EmploymentEndsBeforeStart: 'employmentEnd',
};

const VIOLATION_MESSAGE: Record<EmployeeRecordRuleViolation['_tag'], string> = {
  ContractHoursOutOfRange: 'Contract hours must be above 0 and at most 60 a week, in whole minutes',
  NoWorkingDay: 'Choose at least one working day',
  EmploymentEndsBeforeStart: 'The end date is before the start date',
};

/**
 * AC-20. The request schema already refuses bad hours and an empty working-day set, so in
 * practice only «end before start» (which needs the stored start on an edit) reaches here, as
 * `org.invalid_employee_record` with `rules`. Should the others ever arrive, they answer the same
 * `platform.validation_failed` the schema would, so the client sees one shape per rule.
 */
const invalidEmployeeRecord = ({ violations }: InvalidEmployeeRecord) => {
  if (violations.every((v) => v._tag === 'EmploymentEndsBeforeStart')) {
    const details: EmployeeRecordRuleViolations = { rules: ['end_before_start'] };
    return new Invalid({
      message: VIOLATION_MESSAGE.EmploymentEndsBeforeStart,
      code: OrgErrorCodes.invalidEmployeeRecord,
      details,
    });
  }
  const issues = violations.map((v) => ({
    path: VIOLATION_FIELD[v._tag],
    message: VIOLATION_MESSAGE[v._tag],
  }));
  return new Invalid({
    message: issues.map((i) => `${i.path}: ${i.message}`).join('\n'),
    code: 'platform.validation_failed',
    details: { issues },
  });
};

export const toEmployeeRecordContractError = (error: EmployeeRecordError) => {
  switch (error._tag) {
    case 'InvalidEmployeeRecord':
      return invalidEmployeeRecord(error);
    case 'EmployeeRecordNotFound':
      return new NotFound({
        resource: 'Employee record',
        id: error.id,
        code: OrgErrorCodes.employeeRecordNotFound,
      });
    case 'UserNotFound':
      return new NotFound({ resource: 'Login', id: error.id, code: OrgErrorCodes.userNotFound });
    case 'TeamNotFound':
      return new NotFound({ resource: 'Team', id: error.id, code: OrgErrorCodes.teamNotFound });
  }
};

/** AC-19b: names the record the login already belongs to. */
export const loginAlreadyLinked = (holder: EmployeeRef) => {
  const details: LoginAlreadyLinkedDetails = { employeeRecord: holder };
  return new Conflict({
    message: `This login is already linked to ${holder.fullName}`,
    code: OrgErrorCodes.loginAlreadyLinked,
    details,
  });
};

/** sad §8 Concurrency: the current values and who changed them. */
export const employeeRecordVersionConflict = (current: EmployeeRecordView) =>
  new Conflict({
    message: `${current.lastChangedBy.name ?? 'Someone'} changed this record meanwhile`,
    code: OrgErrorCodes.versionConflict,
    details: Schema.encodeSync(EmployeeRecordConflictDetails)({
      current: toEmployeeRecordDto(current),
    }),
  });

/** AC-19c, AC-27: every resource-week that would become overbooked; nothing was saved. */
export const capacityConfirmationRequired = (
  weeks: ReadonlyArray<OverbookedWeek>,
  employees: ReadonlyMap<string, EmployeeRef>,
) => {
  const details: CapacityImpact = {
    overbookedWeeks: weeks.map((week) => ({
      // The check reports resources it just read from org, so the ref is there; the fallback
      // only covers one removed in between.
      employee: employees.get(week.employeeId) ?? { id: week.employeeId, fullName: '', team: null },
      weekStart: week.weekStart,
      overMinutes: week.overMinutes,
    })),
  };
  const count = weeks.length;
  return new ConfirmationRequired({
    message: `${count} resource-week${count === 1 ? '' : 's'} would become overbooked`,
    code: OrgErrorCodes.capacityConfirmationRequired,
    details,
  });
};
