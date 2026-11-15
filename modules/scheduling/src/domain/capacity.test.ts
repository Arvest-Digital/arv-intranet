import { Option } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  allocatedBetween,
  allocatedOn,
  capacityBetween,
  dailyCapacity,
  dailyShare,
  type EmploymentTerms,
  eachDay,
  type Holidays,
  isIncompleteRecord,
  isoWeekday,
  isoWeekStart,
  isoWeeksInRange,
  type RateSegment,
  weeklyAllocated,
  weeklyCapacity,
} from './capacity';
import { hoursToTicks, minutesToTicks, type Ticks } from './ticks';

// The week of Monday 16 November 2026.
const MON = '2026-11-16';
const TUE = '2026-11-17';
const WED = '2026-11-18';
const THU = '2026-11-19';
const FRI = '2026-11-20';
const SUN = '2026-11-22';

const MON_FRI = [1, 2, 3, 4, 5];
const NO_HOLIDAYS: Holidays = new Set();

const terms = (overrides: Partial<EmploymentTerms> = {}): EmploymentTerms => ({
  contractMinutes: 40 * 60,
  workingDays: MON_FRI,
  employmentStart: '2020-01-01',
  employmentEnd: null,
  ...overrides,
});

const weekly = (hours: number, startsOn = MON, endsOn = '2027-12-31'): RateSegment => ({
  startsOn,
  endsOn,
  rateMinutes: hours * 60,
  ratePeriod: 'week',
});

const hours = (h: number): Option.Option<Ticks> => Option.some(hoursToTicks(h));

describe('ISO calendar', () => {
  it.each([
    { date: MON, weekday: 1, weekStart: MON },
    { date: THU, weekday: 4, weekStart: MON },
    { date: SUN, weekday: 7, weekStart: MON },
    { date: '2027-01-01', weekday: 5, weekStart: '2026-12-28' }, // week across the year end
    { date: '1969-12-31', weekday: 3, weekStart: '1969-12-29' }, // before the epoch
  ])('$date is ISO weekday $weekday in the week of $weekStart', ({ date, weekday, weekStart }) => {
    expect(isoWeekday(date)).toBe(weekday);
    expect(isoWeekStart(date)).toBe(weekStart);
  });

  it('adds days across month and leap-year ends', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays(MON, -1)).toBe('2026-11-15');
  });

  it('lists days inclusively and nothing for a reversed range', () => {
    expect(eachDay(MON, WED)).toEqual([MON, TUE, WED]);
    expect(eachDay(WED, MON)).toEqual([]);
  });

  it('buckets a range into ISO weeks, clipping the edge weeks', () => {
    expect(isoWeeksInRange(WED, '2026-11-24')).toEqual([
      { weekStart: MON, from: WED, to: SUN },
      { weekStart: '2026-11-23', from: '2026-11-23', to: '2026-11-24' },
    ]);
  });
});

describe('daily capacity', () => {
  it.each([
    { name: 'working day', t: terms(), date: MON, expected: hours(8) },
    { name: 'weekend day', t: terms(), date: SUN, expected: hours(0) },
    { name: 'public holiday', t: terms(), date: THU, holidays: [THU], expected: hours(0) },
    {
      name: 'before employment start',
      t: terms({ employmentStart: TUE }),
      date: MON,
      expected: hours(0),
    },
    {
      name: 'on employment start',
      t: terms({ employmentStart: TUE }),
      date: TUE,
      expected: hours(8),
    },
    { name: 'on employment end', t: terms({ employmentEnd: WED }), date: WED, expected: hours(8) },
    {
      name: 'after employment end',
      t: terms({ employmentEnd: WED }),
      date: THU,
      expected: hours(0),
    },
    // AC-19: 24 h Mon–Wed → 8 h on each of those days.
    {
      name: 'AC-19 part-timer Mon',
      t: terms({ contractMinutes: 1440, workingDays: [1, 2, 3] }),
      date: MON,
      expected: hours(8),
    },
    {
      name: 'AC-19 part-timer Thu',
      t: terms({ contractMinutes: 1440, workingDays: [1, 2, 3] }),
      date: THU,
      expected: hours(0),
    },
    // AC-06: incomplete records have unknown capacity, even on a non-working day.
    {
      name: 'no contract hours',
      t: terms({ contractMinutes: null }),
      date: MON,
      expected: Option.none(),
    },
    {
      name: 'no start date',
      t: terms({ employmentStart: null }),
      date: SUN,
      expected: Option.none(),
    },
  ])('$name', ({ t, date, holidays = [], expected }) => {
    expect(dailyCapacity(t, new Set(holidays), date)).toEqual(expected);
  });

  it('AC-06: working days and team do not make a record incomplete', () => {
    expect(isIncompleteRecord(terms())).toBe(false);
    expect(isIncompleteRecord(terms({ contractMinutes: null }))).toBe(true);
    expect(isIncompleteRecord(terms({ employmentStart: null }))).toBe(true);
  });

  it('AC-19: 24 h Mon–Wed is 24 h per full week', () => {
    const partTimer = terms({ contractMinutes: 1440, workingDays: [1, 2, 3] });
    expect(capacityBetween(partTimer, NO_HOLIDAYS, MON, SUN)).toEqual(hours(24));
  });

  it('is exact for a share that is not a finite decimal (40 h over 3 days)', () => {
    const t = terms({ workingDays: [1, 3, 5] });
    expect(dailyShare(t)).toEqual(Option.some((minutesToTicks(2400) / 3) as Ticks));
    expect(capacityBetween(t, NO_HOLIDAYS, MON, SUN)).toEqual(hours(40));
  });

  it('ignores a duplicated working day', () => {
    expect(dailyShare(terms({ workingDays: [1, 1, 2, 3, 4, 5] }))).toEqual(hours(8));
  });
});

describe('property: a full week sums to the contract exactly', () => {
  const subsets = Array.from({ length: 127 }, (_, i) =>
    [1, 2, 3, 4, 5, 6, 7].filter((_, bit) => ((i + 1) >> bit) & 1),
  );
  const contracts = [1, 15, 450, 1440, 2250, 2400, 2401, 3599, 3600];

  it.each([1, 2, 3, 4, 5, 6, 7])('for every set of %i working days', (count) => {
    for (const workingDays of subsets.filter((s) => s.length === count)) {
      for (const contractMinutes of contracts) {
        const t = terms({ contractMinutes, workingDays });
        const contract = Option.some(minutesToTicks(contractMinutes));
        expect(capacityBetween(t, NO_HOLIDAYS, MON, SUN)).toEqual(contract);
        // The `week` rate spreads the same way: a full week allocates the weekly rate.
        const segment: RateSegment = { ...weekly(0), rateMinutes: contractMinutes };
        expect(allocatedBetween([segment], t, NO_HOLIDAYS, MON, SUN)).toEqual(contract);
      }
    }
  });
});

describe('rate → per-day spread', () => {
  it.each([
    { name: 'week rate on a working day', s: weekly(40), date: MON, expected: hours(8) },
    { name: 'week rate on a weekend day', s: weekly(40), date: SUN, expected: hours(0) },
    {
      name: 'week rate on a holiday',
      s: weekly(40),
      date: THU,
      holidays: [THU],
      expected: hours(0),
    },
    { name: 'before the segment', s: weekly(40, TUE), date: MON, expected: hours(0) },
    { name: 'after the segment', s: weekly(40, MON, TUE), date: WED, expected: hours(0) },
    {
      name: 'day rate',
      s: { startsOn: MON, endsOn: FRI, rateMinutes: 4 * 60, ratePeriod: 'day' } as const,
      date: TUE,
      expected: hours(4),
    },
    {
      name: 'full-day leave takes the daily share',
      s: { startsOn: MON, endsOn: FRI, rateMinutes: null, ratePeriod: 'full-day' } as const,
      date: TUE,
      expected: hours(8),
    },
    {
      name: 'full-day leave skips a holiday',
      s: { startsOn: MON, endsOn: FRI, rateMinutes: null, ratePeriod: 'full-day' } as const,
      date: THU,
      holidays: [THU],
      expected: hours(0),
    },
  ])('$name', ({ s, date, holidays = [], expected }) => {
    expect(allocatedOn(s, terms(), new Set(holidays), date)).toEqual(expected);
  });

  it('keeps allocating past the employment end (needing attention, AC-21)', () => {
    expect(allocatedOn(weekly(40), terms({ employmentEnd: MON }), NO_HOLIDAYS, FRI)).toEqual(
      hours(8),
    );
  });

  it('leave on unknown contract hours is unknown', () => {
    const leave: RateSegment = {
      startsOn: MON,
      endsOn: FRI,
      rateMinutes: null,
      ratePeriod: 'full-day',
    };
    expect(allocatedOn(leave, terms({ contractMinutes: null }), NO_HOLIDAYS, MON)).toEqual(
      Option.none(),
    );
  });
});

describe('PRD rule table', () => {
  it('AC-08: 40 h/wk from a Wednesday → 24 h; week with a Thursday holiday → 32 h', () => {
    const nextThu = addDays(THU, 7);
    const holidays: Holidays = new Set([nextThu]);
    const allocated = weeklyAllocated([weekly(40, WED)], terms(), holidays, MON, addDays(SUN, 7));
    expect(allocated.map((w) => [w.weekStart, w.ticks])).toEqual([
      [MON, hours(24)],
      [addDays(MON, 7), hours(32)],
    ]);
    // Capacity drops by the holiday too.
    expect(weeklyCapacity(terms(), holidays, MON, addDays(SUN, 7)).map((w) => w.ticks)).toEqual([
      hours(40),
      hours(32),
    ]);
  });

  it('AC-19: 24 h Mon–Wed → 8 h a day, 24 h a week', () => {
    const partTimer = terms({ contractMinutes: 1440, workingDays: [1, 2, 3] });
    expect(eachDay(MON, SUN).map((d) => dailyCapacity(partTimer, NO_HOLIDAYS, d))).toEqual([
      hours(8),
      hours(8),
      hours(8),
      hours(0),
      hours(0),
      hours(0),
      hours(0),
    ]);
    expect(weeklyCapacity(partTimer, NO_HOLIDAYS, MON, SUN)[0]?.ticks).toEqual(hours(24));
  });

  it('AC-27: a Monday holiday drops the full-timer by that Monday, not the Wed–Fri part-timer', () => {
    const fullTimer = terms();
    const partTimer = terms({ contractMinutes: 24 * 60, workingDays: [3, 4, 5] });
    const mondayHoliday: Holidays = new Set([MON]);
    const figures = (t: EmploymentTerms, holidays: Holidays) => ({
      capacity: capacityBetween(t, holidays, MON, SUN),
      allocated: allocatedBetween([weekly(Number(t.contractMinutes) / 60)], t, holidays, MON, SUN),
    });

    expect(figures(fullTimer, NO_HOLIDAYS)).toEqual({ capacity: hours(40), allocated: hours(40) });
    expect(figures(fullTimer, mondayHoliday)).toEqual({
      capacity: hours(32),
      allocated: hours(32),
    });
    expect(figures(partTimer, NO_HOLIDAYS)).toEqual({ capacity: hours(24), allocated: hours(24) });
    expect(figures(partTimer, mondayHoliday)).toEqual({
      capacity: hours(24),
      allocated: hours(24),
    });
  });

  it.each([
    { name: 'full-timer 40 h Mon–Fri', t: terms(), perDay: 8 },
    {
      name: 'part-timer 24 h Mon–Wed',
      t: terms({ contractMinutes: 1440, workingDays: [1, 2, 3] }),
      perDay: 8,
    },
    { name: '37.5 h Mon–Fri', t: terms({ contractMinutes: 2250 }), perDay: 7.5 },
    { name: '40 h over 3 days', t: terms({ workingDays: [1, 3, 5] }), perDay: 40 / 3 },
  ])('AC-15: a leave day takes contract ÷ working days ($name)', ({ t, perDay }) => {
    const leave: RateSegment = {
      startsOn: MON,
      endsOn: SUN,
      rateMinutes: null,
      ratePeriod: 'full-day',
    };
    const workingDays = new Set(t.workingDays).size;
    const day = Option.getOrThrow(dailyShare(t));
    expect(day).toBe(Math.round(perDay * 60 * 420)); // exact integer ticks, even for 13⅓ h
    expect(day * workingDays).toBe(minutesToTicks(Number(t.contractMinutes)));
    // A full week of leave takes the whole week's capacity, never more or less.
    expect(allocatedBetween([leave], t, NO_HOLIDAYS, MON, SUN)).toEqual(
      Option.some((day * workingDays) as Ticks),
    );
    expect(allocatedBetween([leave], t, NO_HOLIDAYS, MON, SUN)).toEqual(
      capacityBetween(t, NO_HOLIDAYS, MON, SUN),
    );
  });

  it('AC-15: 5 working days of leave over a holiday week take the full daily capacity each', () => {
    // Leave Mon–Mon (next week), Thursday a holiday → 5 working days booked.
    const leave: RateSegment = {
      startsOn: MON,
      endsOn: addDays(MON, 7),
      rateMinutes: null,
      ratePeriod: 'full-day',
    };
    const holidays: Holidays = new Set([THU]);
    expect(
      weeklyAllocated([leave], terms(), holidays, MON, addDays(SUN, 7)).map((w) => w.ticks),
    ).toEqual([hours(32), hours(8)]);
  });
});

describe('weekly bucketing', () => {
  it('reports unknown weeks for an incomplete record', () => {
    const weeks = weeklyCapacity(terms({ contractMinutes: null }), NO_HOLIDAYS, MON, SUN);
    expect(weeks).toEqual([{ weekStart: MON, from: MON, to: SUN, ticks: Option.none() }]);
  });

  it('sums several segments (AC-10 shape: 24 h + 16 h)', () => {
    const allocated = weeklyAllocated([weekly(24), weekly(16)], terms(), NO_HOLIDAYS, MON, SUN);
    expect(allocated[0]?.ticks).toEqual(hours(40));
  });

  it('stops capacity at the employment start mid-week (AC-19a joiner from Wednesday)', () => {
    expect(capacityBetween(terms({ employmentStart: WED }), NO_HOLIDAYS, MON, SUN)).toEqual(
      hours(24),
    );
  });
});
