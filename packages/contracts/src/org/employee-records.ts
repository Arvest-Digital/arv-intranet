import { Schema } from 'effect';
import {
  FullName,
  IsoDate,
  NullableContractMinutes,
  strict,
  TeamRef,
  UserRef,
  WorkingDays,
} from './values';

/**
 * An employee record (OpenAPI `EmployeeRecord`; `getEmployeeRecord`, `createEmployeeRecord`,
 * `updateEmployeeRecord`). Only callers holding `org:manage-employee-records` get one, so the
 * employment end date is never redacted here (AC-22).
 */
export const EmployeeRecord = Schema.Struct({
  id: Schema.UUID,
  fullName: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200)),
  /** Linked intranet login; null = not linked (AC-18). */
  userId: Schema.NullOr(Schema.UUID),
  team: Schema.NullOr(TeamRef),
  /** Weekly contract hours × 60; null = incomplete record. */
  contractMinutes: NullableContractMinutes,
  workingDays: WorkingDays,
  employmentStart: Schema.NullOr(IsoDate),
  employmentEnd: Schema.NullOr(IsoDate),
  /** No contract hours or no start date (AC-06). */
  incomplete: Schema.Boolean,
  /** Send it back on edit (sad §8 Concurrency). */
  version: Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
  lastChangedBy: UserRef,
  lastChangedAt: Schema.Date,
  createdAt: Schema.Date,
});
export type EmployeeRecord = typeof EmployeeRecord.Type;
export type EmployeeRecordEncoded = typeof EmployeeRecord.Encoded;

/** `listEmployeeRecords` 200: a cursor page in id (creation) order. */
export const EmployeeRecordPage = Schema.Struct({
  items: Schema.Array(EmployeeRecord),
  hasNext: Schema.Boolean,
  hasPrev: Schema.Boolean,
  nextCursor: Schema.NullOr(Schema.UUID),
});
export type EmployeeRecordPage = typeof EmployeeRecordPage.Type;
export type EmployeeRecordPageEncoded = typeof EmployeeRecordPage.Encoded;

/** A field the body may leave out. JSON has no `undefined`, so only absence counts. */
const optional = <S extends Schema.Schema.Any>(schema: S) =>
  Schema.optionalWith(schema, { exact: true });

/**
 * `createEmployeeRecord` body (AC-19a). Only the name is required: a record without contract
 * hours or a start date is saved as incomplete (AC-06); working days default to Monday–Friday.
 */
export const EmployeeRecordCreate = strict(
  Schema.Struct({
    fullName: FullName,
    userId: optional(Schema.NullOr(Schema.UUID)),
    teamId: optional(Schema.NullOr(Schema.UUID)),
    contractMinutes: optional(NullableContractMinutes),
    workingDays: optional(WorkingDays),
    employmentStart: optional(Schema.NullOr(IsoDate)),
    employmentEnd: optional(Schema.NullOr(IsoDate)),
  }),
);
export type EmployeeRecordCreate = typeof EmployeeRecordCreate.Type;

/**
 * `updateEmployeeRecord` body (AC-19, AC-19a, AC-19c, AC-21): fields left out keep their value,
 * `null` clears a nullable one. `version` is the one the form was opened at.
 */
export const EmployeeRecordChange = strict(
  Schema.Struct({
    version: Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
    fullName: optional(FullName),
    userId: optional(Schema.NullOr(Schema.UUID)),
    teamId: optional(Schema.NullOr(Schema.UUID)),
    contractMinutes: optional(NullableContractMinutes),
    workingDays: optional(WorkingDays),
    employmentStart: optional(Schema.NullOr(IsoDate)),
    employmentEnd: optional(Schema.NullOr(IsoDate)),
    /** Confirms the capacity warning (AC-19c). */
    confirm: optional(Schema.Boolean),
  }),
);
export type EmployeeRecordChange = typeof EmployeeRecordChange.Type;

/** `employeeRecordId` path parameter. */
export const EmployeeRecordIdPath = Schema.Struct({ employeeRecordId: Schema.UUID });
