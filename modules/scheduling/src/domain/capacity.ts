import { Option } from 'effect';
import { addTicks, divideTicksExactly, minutesToTicks, type Ticks, ZERO_TICKS } from './ticks';

/**
 * The capacity calendar (ADR-0005, ADR-0009): per-day capacity and the per-day spread of an
 * allocation rate, both in exact ticks, plus ISO-week bucketing. Pure functions over the inputs
 * `org` owns (employment terms, public holidays) and the segments `scheduling` owns.
 *
 * Dates are business dates `YYYY-MM-DD` with no time (sad §8); weeks are ISO weeks, Monday to
 * Sunday. A week is identified by the date of its Monday.
 */

/** A business date, `YYYY-MM-DD`. */
export type IsoDate = string;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const MS_PER_DAY = 86_400_000;

/** Days since 1970-01-01 (UTC calendar arithmetic, so no time-zone or DST drift). */
const toEpochDay = (date: IsoDate): number => {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / MS_PER_DAY);
};

const fromEpochDay = (epochDay: number): IsoDate =>
  new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);

export const addDays = (date: IsoDate, days: number): IsoDate =>
  fromEpochDay(toEpochDay(date) + days);

export const isoWeekday = (date: IsoDate): IsoWeekday => {
  // 1970-01-01 was a Thursday (ISO 4).
  const mondayBased = (((toEpochDay(date) + 3) % 7) + 7) % 7;
  return (mondayBased + 1) as IsoWeekday;
};

/** The Monday of the ISO week `date` falls in: the week's bucket key. */
export const isoWeekStart = (date: IsoDate): IsoDate => addDays(date, 1 - isoWeekday(date));

/** Every date from `from` to `to`, both inclusive; empty when `to` is before `from`. */
export const eachDay = (from: IsoDate, to: IsoDate): ReadonlyArray<IsoDate> => {
  const days: IsoDate[] = [];
  for (let d = toEpochDay(from), last = toEpochDay(to); d <= last; d++) days.push(fromEpochDay(d));
  return days;
};

/** One ISO week clipped to a range: `from`/`to` differ from Monday/Sunday only at the edges. */
export type WeekSlice = {
  readonly weekStart: IsoDate;
  readonly from: IsoDate;
  readonly to: IsoDate;
};

/** The ISO weeks touching `from`…`to` (inclusive), in order, each clipped to the range. */
export const isoWeeksInRange = (from: IsoDate, to: IsoDate): ReadonlyArray<WeekSlice> => {
  const weeks: WeekSlice[] = [];
  for (let weekStart = isoWeekStart(from); weekStart <= to; weekStart = addDays(weekStart, 7)) {
    const sunday = addDays(weekStart, 6);
    weeks.push({
      weekStart,
      from: weekStart < from ? from : weekStart,
      to: sunday > to ? to : sunday,
    });
  }
  return weeks;
};

/**
 * The employee-record fields capacity is computed from, as `org`'s facade hands them over.
 * `contractMinutes` / `employmentStart` are null on an incomplete record (AC-06).
 */
export type EmploymentTerms = {
  readonly contractMinutes: number | null;
  readonly workingDays: ReadonlyArray<number>;
  readonly employmentStart: IsoDate | null;
  readonly employmentEnd: IsoDate | null;
};

/** The company-wide public holidays (US-09), as a set of dates. */
export type Holidays = ReadonlySet<IsoDate>;

/** AC-06: no contract hours or no start date means capacity is unknown. */
export const isIncompleteRecord = (terms: EmploymentTerms): boolean =>
  terms.contractMinutes === null || terms.employmentStart === null;

const workingDayCount = (terms: EmploymentTerms): number => new Set(terms.workingDays).size;

/** One of the resource's working days and not a public holiday; employment period ignored. */
export const isWorkingDay = (terms: EmploymentTerms, holidays: Holidays, date: IsoDate): boolean =>
  terms.workingDays.includes(isoWeekday(date)) && !holidays.has(date);

export const isWithinEmployment = (terms: EmploymentTerms, date: IsoDate): boolean =>
  terms.employmentStart !== null &&
  date >= terms.employmentStart &&
  (terms.employmentEnd === null || date <= terms.employmentEnd);

/**
 * Contract hours ÷ working days (AC-19), regardless of the date: what one working day is worth,
 * and what one day of leave takes (AC-15). `None` when the contract hours are unknown.
 */
export const dailyShare = (terms: EmploymentTerms): Option.Option<Ticks> => {
  const days = workingDayCount(terms);
  if (terms.contractMinutes === null || days === 0) return Option.none();
  return Option.some(divideTicksExactly(minutesToTicks(terms.contractMinutes), days));
};

/**
 * Capacity on `date`: the daily share on a working day inside the employment period, zero on a
 * non-working day, a public holiday (AC-08, AC-27) or outside the employment period, and `None`
 * for an incomplete record (AC-06).
 */
export const dailyCapacity = (
  terms: EmploymentTerms,
  holidays: Holidays,
  date: IsoDate,
): Option.Option<Ticks> => {
  if (isIncompleteRecord(terms)) return Option.none();
  if (!isWorkingDay(terms, holidays, date) || !isWithinEmployment(terms, date)) {
    return Option.some(ZERO_TICKS);
  }
  return dailyShare(terms);
};

/** `day` and `week` are work at a rate (AC-07); `full-day` is leave (AC-15). */
export type RatePeriod = 'day' | 'week' | 'full-day';

/** The part of an allocation segment the spread needs (structurally matches the stored segment). */
export type RateSegment = {
  readonly startsOn: IsoDate;
  readonly endsOn: IsoDate;
  /** Null only for `full-day`. */
  readonly rateMinutes: number | null;
  readonly ratePeriod: RatePeriod;
};

/**
 * What a segment allocates on `date` (AC-08, AC-15, AC-19): nothing outside the segment, on a
 * non-working day or on a public holiday; otherwise the daily rate (`day`), the weekly rate ÷ the
 * resource's working-day count (`week`), or the full daily share (`full-day`, following later
 * contract changes). The employment period is not applied: allocations past it stay visible and
 * are marked needing attention (AC-21). `None` only for leave on unknown contract hours.
 */
export const allocatedOn = (
  segment: RateSegment,
  terms: EmploymentTerms,
  holidays: Holidays,
  date: IsoDate,
): Option.Option<Ticks> => {
  if (date < segment.startsOn || date > segment.endsOn) return Option.some(ZERO_TICKS);
  if (!isWorkingDay(terms, holidays, date)) return Option.some(ZERO_TICKS);
  switch (segment.ratePeriod) {
    case 'full-day':
      return dailyShare(terms);
    case 'day':
      return Option.some(minutesToTicks(segment.rateMinutes ?? 0));
    case 'week':
      return Option.some(
        divideTicksExactly(minutesToTicks(segment.rateMinutes ?? 0), workingDayCount(terms)),
      );
  }
};

/** Sums `perDay` over `from`…`to`; `None` as soon as any day is unknown. */
export const sumOverDays = (
  from: IsoDate,
  to: IsoDate,
  perDay: (date: IsoDate) => Option.Option<Ticks>,
): Option.Option<Ticks> => {
  let total = ZERO_TICKS;
  for (const date of eachDay(from, to)) {
    const value = perDay(date);
    if (Option.isNone(value)) return Option.none();
    total = addTicks(total, value.value);
  }
  return Option.some(total);
};

/** Capacity over `from`…`to`; `None` for an incomplete record. */
export const capacityBetween = (
  terms: EmploymentTerms,
  holidays: Holidays,
  from: IsoDate,
  to: IsoDate,
): Option.Option<Ticks> => sumOverDays(from, to, (date) => dailyCapacity(terms, holidays, date));

/** Hours all `segments` allocate over `from`…`to`. */
export const allocatedBetween = (
  segments: ReadonlyArray<RateSegment>,
  terms: EmploymentTerms,
  holidays: Holidays,
  from: IsoDate,
  to: IsoDate,
): Option.Option<Ticks> =>
  sumOverDays(from, to, (date) => {
    let total = ZERO_TICKS;
    for (const segment of segments) {
      const value = allocatedOn(segment, terms, holidays, date);
      if (Option.isNone(value)) return Option.none();
      total = addTicks(total, value.value);
    }
    return Option.some(total);
  });

/** A per-week figure: `ticks` is `None` when unknown (incomplete record). */
export type WeeklyTicks = WeekSlice & { readonly ticks: Option.Option<Ticks> };

/** Buckets `perDay` into the ISO weeks of `from`…`to` (edge weeks clipped to the range). */
export const bucketByIsoWeek = (
  from: IsoDate,
  to: IsoDate,
  perDay: (date: IsoDate) => Option.Option<Ticks>,
): ReadonlyArray<WeeklyTicks> =>
  isoWeeksInRange(from, to).map((week) => ({
    ...week,
    ticks: sumOverDays(week.from, week.to, perDay),
  }));

/** Weekly capacity over `from`…`to`. */
export const weeklyCapacity = (
  terms: EmploymentTerms,
  holidays: Holidays,
  from: IsoDate,
  to: IsoDate,
): ReadonlyArray<WeeklyTicks> =>
  bucketByIsoWeek(from, to, (date) => dailyCapacity(terms, holidays, date));

/** Weekly hours `segments` allocate over `from`…`to`. */
export const weeklyAllocated = (
  segments: ReadonlyArray<RateSegment>,
  terms: EmploymentTerms,
  holidays: Holidays,
  from: IsoDate,
  to: IsoDate,
): ReadonlyArray<WeeklyTicks> =>
  isoWeeksInRange(from, to).map((week) => ({
    ...week,
    ticks: allocatedBetween(segments, terms, holidays, week.from, week.to),
  }));
