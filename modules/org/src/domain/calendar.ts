import { Schema } from 'effect';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is `YYYY-MM-DD` and names a real day (no 2026-02-30). */
const isRealDay = (value: string): boolean => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/**
 * A business date, `YYYY-MM-DD`, with no time or zone (sad §8 Dates and time zone) — the form
 * the kernel's `Today` gives and Postgres `date` columns return. Compared as strings.
 */
export const CalendarDate = Schema.String.pipe(
  Schema.pattern(ISO_DATE),
  Schema.filter(isRealDay, { message: () => 'Expected a real date as YYYY-MM-DD' }),
);
export type CalendarDate = typeof CalendarDate.Type;

/** An ISO weekday: 1 = Monday … 7 = Sunday. */
export const IsoWeekday = Schema.Literal(1, 2, 3, 4, 5, 6, 7);
export type IsoWeekday = typeof IsoWeekday.Type;

/** The working days a record gets when none are given (AC-06). */
export const DEFAULT_WORKING_DAYS: ReadonlyArray<IsoWeekday> = [1, 2, 3, 4, 5];

/** The days a resource works, as a set: at least one, no repeats (AC-20). */
export const WorkingDays = Schema.Array(IsoWeekday).pipe(
  Schema.minItems(1),
  Schema.filter((days) => new Set(days).size === days.length, {
    message: () => 'Expected each working day at most once',
  }),
);
export type WorkingDays = typeof WorkingDays.Type;

/** `[5, 1, 3, 1]` → `[1, 3, 5]`: the stored form of a working-day set. */
export const normaliseWorkingDays = (days: Iterable<IsoWeekday>): ReadonlyArray<IsoWeekday> =>
  [...new Set(days)].sort((a, b) => a - b);
