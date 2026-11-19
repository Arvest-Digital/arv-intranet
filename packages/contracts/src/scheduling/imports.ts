import { Schema } from 'effect';
import { IsoDate, UserRef } from '../org/values';
import { Minutes } from './reads';

// The one-time import (openapi.yaml `getImportStatus`, `importSpreadsheet`; US-11, AC-30–AC-33).
// The spreadsheet's format is still open (PRD §8): the upload takes any file and the api reads it.

/** A file part of a multipart form, as `hono`'s form validator hands it over (a `File`). */
export interface UploadedFile {
  readonly size: number;
  readonly text: () => Promise<string>;
}

const isUploadedFile = (u: unknown): u is UploadedFile =>
  typeof u === 'object' &&
  u !== null &&
  typeof (u as { size?: unknown }).size === 'number' &&
  typeof (u as { text?: unknown }).text === 'function';

const UploadedFileSchema = Schema.declare(isUploadedFile, {
  identifier: 'UploadedFile',
  message: () => 'Expected the planning spreadsheet as a file',
});

/**
 * `importSpreadsheet` multipart body (OpenAPI `ImportUpload`). Form fields are text, so `confirm`
 * arrives as `"true"` / `"false"`; left out means not confirmed (ADR-0010).
 */
export const ImportUpload = Schema.Struct({
  file: UploadedFileSchema,
  confirm: Schema.optionalWith(
    Schema.transform(Schema.Literal('true', 'false'), Schema.Boolean, {
      strict: true,
      decode: (text) => text === 'true',
      encode: (flag) => (flag ? 'true' : 'false'),
    }),
    { default: () => false },
  ),
});
export type ImportUpload = typeof ImportUpload.Type;

/** OpenAPI `ImportResult`: the completed run (AC-30). */
export const ImportResult = Schema.Struct({
  id: Schema.UUID,
  importedBy: UserRef,
  employeeRecordsCreated: Schema.Int.pipe(Schema.nonNegative()),
  projectsCreated: Schema.Int.pipe(Schema.nonNegative()),
  allocationsCreated: Schema.Int.pipe(Schema.nonNegative()),
  createdAt: Schema.Date,
});
export type ImportResult = typeof ImportResult.Type;
export type ImportResultEncoded = typeof ImportResult.Encoded;

/** OpenAPI `ImportStatus` (AC-32): the web offers the import only while `completed` is false. */
export const ImportStatus = Schema.Struct({
  completed: Schema.Boolean,
  run: Schema.NullOr(ImportResult),
});
export type ImportStatus = typeof ImportStatus.Type;
export type ImportStatusEncoded = typeof ImportStatus.Encoded;

/** OpenAPI `ImportResourceWeekOver`: named by the spreadsheet's full name (the record may not exist yet). */
export const ImportResourceWeekOver = Schema.Struct({
  fullName: Schema.String.pipe(Schema.maxLength(200)),
  weekStart: IsoDate,
  overMinutes: Minutes,
});
export type ImportResourceWeekOver = typeof ImportResourceWeekOver.Type;

/** `details` of `scheduling.import_confirmation_required` (OpenAPI `ImportPreview`, AC-30). */
export const ImportPreview = Schema.Struct({
  employeeRecordsToCreate: Schema.Int.pipe(Schema.nonNegative()),
  projectsToCreate: Schema.Int.pipe(Schema.nonNegative()),
  allocationsToCreate: Schema.Int.pipe(Schema.nonNegative()),
  incompleteRecords: Schema.Int.pipe(Schema.nonNegative()),
  overbookedWeeks: Schema.Array(ImportResourceWeekOver),
});
export type ImportPreview = typeof ImportPreview.Type;

/** Why a row stops the import (OpenAPI `ImportProblemRowsDetails.rows[].reason`, AC-31). */
export const ImportProblemReason = Schema.Literal(
  'empty_hours',
  'end_before_start',
  'similar_name',
  'invalid_allocation',
  'outside_employment_period',
  'invalid_employee_record',
);
export type ImportProblemReason = typeof ImportProblemReason.Type;

/** `details` of `scheduling.import_problem_rows` (OpenAPI `ImportProblemRowsDetails`, AC-31). */
export const ImportProblemRowsDetails = Schema.Struct({
  rows: Schema.NonEmptyArray(
    Schema.Struct({
      row: Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
      reason: ImportProblemReason,
      message: Schema.String,
    }),
  ),
});
export type ImportProblemRowsDetails = typeof ImportProblemRowsDetails.Type;

/** `details` of `scheduling.import_already_completed` (OpenAPI `ImportCompletedDetails`, AC-32). */
export const ImportCompletedDetails = Schema.Struct({ completedAt: Schema.Date });
export type ImportCompletedDetails = typeof ImportCompletedDetails.Type;
export type ImportCompletedDetailsEncoded = typeof ImportCompletedDetails.Encoded;

/** `details` of `scheduling.missing_permission` on the import: every permission missing (AC-33). */
export const MissingPermissions = Schema.Struct({
  missingPermissions: Schema.NonEmptyArray(Schema.String),
});
export type MissingPermissions = typeof MissingPermissions.Type;
