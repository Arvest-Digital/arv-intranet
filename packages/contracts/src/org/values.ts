import { Schema } from 'effect';

export { strict } from '../shared/strict';

const isRealDay = (value: string): boolean => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/** A business date with no time (OpenAPI `format: date`): `YYYY-MM-DD`, a real day. */
export const IsoDate = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}$/, { message: () => 'Expected a date as YYYY-MM-DD' }),
  Schema.filter(isRealDay, { message: () => 'Expected a real date as YYYY-MM-DD' }),
);

/** Weekly contract hours × 60 (ADR-0009): a whole number above 0, at most 60 hours (AC-20). */
const CONTRACT_HOURS_RULE =
  'Contract hours must be above 0 and at most 60 a week, in whole minutes';

const isContractMinutes = (n: number) => Number.isInteger(n) && n > 0 && n <= 3600;

/** Weekly contract hours × 60 (ADR-0009): a whole number above 0, at most 60 hours (AC-20). */
export const ContractMinutes = Schema.Number.pipe(
  Schema.filter(isContractMinutes, { message: () => CONTRACT_HOURS_RULE }),
);

/**
 * `ContractMinutes` or null (an incomplete record, AC-06), checked as one rule so a bad value
 * reports only the hours rule, not also «Expected null».
 */
export const NullableContractMinutes = Schema.NullOr(Schema.Number).pipe(
  Schema.filter((n) => n === null || isContractMinutes(n), { message: () => CONTRACT_HOURS_RULE }),
);

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export const IsoWeekday = Schema.Literal(1, 2, 3, 4, 5, 6, 7);

/** The days a resource works: at least one, each once (OpenAPI `WorkingDays`, AC-06, AC-20). */
export const WorkingDays = Schema.Array(IsoWeekday).pipe(
  Schema.minItems(1, { message: () => 'Choose at least one working day' }),
  Schema.maxItems(7),
  Schema.filter((days) => new Set(days).size === days.length, {
    message: () => 'Expected each working day at most once',
  }),
);

/** Trimmed, non-empty, at most 200 characters. */
export const FullName = Schema.NonEmptyTrimmedString.pipe(Schema.maxLength(200));

/** OpenAPI `TeamRef`. */
export const TeamRef = Schema.Struct({
  id: Schema.UUID,
  name: Schema.String.pipe(Schema.maxLength(100)),
});
export type TeamRef = typeof TeamRef.Type;

/** OpenAPI `UserRef`: the intranet user who made a change. */
export const UserRef = Schema.Struct({ id: Schema.UUID, name: Schema.String });
export type UserRef = typeof UserRef.Type;

/** OpenAPI `EmployeeRef`: a resource as other answers name it; `team: null` = «no team». */
export const EmployeeRef = Schema.Struct({
  id: Schema.UUID,
  fullName: Schema.String.pipe(Schema.maxLength(200)),
  team: Schema.NullOr(TeamRef),
});
export type EmployeeRef = typeof EmployeeRef.Type;
