import { describe, expect, it } from 'vitest';
import { EDIT_ALLOCATIONS } from '../permissions';
import type { EmploymentTerms, Holidays, RateSegment } from './capacity';
import { type FreeListCandidate, freeList, freeListPeriod } from './free-list';
import { hoursToTicks } from './ticks';
import { employmentEndView, type Viewer } from './visibility';

// Today is Wednesday 18 November 2026; the period is today to Sunday 29 November (N = 2).
const MON = '2026-11-16';
const TUE = '2026-11-17';
const TODAY = '2026-11-18';
const MON2 = '2026-11-23';
const WED2 = '2026-11-25';
const THU2 = '2026-11-26';
const FRI2 = '2026-11-27';
const SUN2 = '2026-11-29';

const NO_HOLIDAYS: Holidays = new Set();
const h = hoursToTicks;

const terms = (overrides: Partial<EmploymentTerms> = {}): EmploymentTerms => ({
  contractMinutes: 40 * 60,
  workingDays: [1, 2, 3, 4, 5],
  employmentStart: '2020-01-01',
  employmentEnd: null,
  ...overrides,
});

const seg = (
  period: RateSegment['ratePeriod'],
  hours: number | null,
  startsOn: string,
  endsOn: string,
) => ({
  segments: [
    { startsOn, endsOn, rateMinutes: hours === null ? null : hours * 60, ratePeriod: period },
  ],
});

const candidate = (
  resource: string,
  allocations: ReadonlyArray<{ segments: ReadonlyArray<RateSegment> }> = [],
  overrides: Partial<EmploymentTerms> = {},
): FreeListCandidate<string> => ({ resource, terms: terms(overrides), allocations });

describe('AC-04: free list period', () => {
  it.each([
    { today: TODAY, weeks: 2, to: SUN2 },
    { today: MON, weeks: 1, to: '2026-11-22' },
    { today: '2026-11-22', weeks: 1, to: '2026-11-22' }, // Sunday: nothing left this week
    { today: TODAY, weeks: 12, to: '2027-02-07' },
  ])('from $today over $weeks weeks ends on $to', ({ today, weeks, to }) => {
    expect(freeListPeriod(today, weeks)).toEqual({ from: today, to });
  });

  it('refuses a period of no weeks as a defect', () => {
    expect(() => freeListPeriod(TODAY, 0)).toThrow(RangeError);
  });
});

describe('AC-04 / AC-06: who has at least 16 free hours over the next 2 weeks', () => {
  const list = freeList(
    [
      candidate('below', [seg('day', 8, TODAY, THU2)]), // W1 0, W2 8 → 8
      candidate('over-next-week', [seg('week', 48, MON2, SUN2)]), // W1 24, W2 −8 → 0
      candidate('incomplete', [], { contractMinutes: null }),
      candidate('nothing', []), // W1 24 (Wed–Fri), W2 40
      candidate('busy-before-today', [seg('day', 20, MON, TUE)]), // past days do not count
      candidate('exactly-16', [seg('day', 8, TODAY, WED2)]), // W1 0, W2 16
      candidate('half', [seg('week', 20, MON, SUN2)]), // W1 24 − 12, W2 20
    ],
    NO_HOLIDAYS,
    TODAY,
    2,
    h(16),
  );

  it('counts from today and the next full week', () => {
    expect(list).toMatchObject({ from: TODAY, to: SUN2, weeks: [MON, MON2] });
  });

  it('ranks most free first, ties in the given order, at least 16 h, overbooked week = 0', () => {
    expect(list.entries.map((e) => [e.resource, e.freeTotal])).toEqual([
      ['nothing', h(64)],
      ['busy-before-today', h(64)],
      ['half', h(32)],
      ['over-next-week', h(24)],
      ['exactly-16', h(16)],
    ]);
  });

  it('shows the free hours per week, never negative', () => {
    const overNext = list.entries.find((e) => e.resource === 'over-next-week');
    expect(overNext?.freePerWeek).toEqual([
      { weekStart: MON, free: h(24) },
      { weekStart: MON2, free: h(0) },
    ]);
  });

  it('leaves out incomplete records and lists them apart', () => {
    expect(list.incompleteRecords).toEqual(['incomplete']);
  });
});

describe('AC-15: leave days are not free', () => {
  it('a week of leave counts zero', () => {
    const list = freeList(
      [candidate('away', [seg('full-day', null, MON2, FRI2)])],
      NO_HOLIDAYS,
      TODAY,
      2,
      h(0),
    );
    expect(list.entries[0]?.freePerWeek.map((w) => w.free)).toEqual([h(24), h(0)]);
  });
});

describe('AC-21b / AC-22: weeks past the employment end', () => {
  const leaver = candidate('leaver', [seg('week', 20, MON, SUN2)], { employmentEnd: WED2 });
  const maySee: Viewer = { permissions: new Set([EDIT_ALLOCATIONS]), ownEmployeeId: null };
  const mayNotSee: Viewer = { permissions: new Set(), ownEmployeeId: null };

  it('does not count a week needing attention as free', () => {
    const list = freeList(
      [{ ...leaver, visibility: employmentEndView(maySee, WED2) }],
      NO_HOLIDAYS,
      TODAY,
      2,
      h(0),
    );
    expect(list.entries[0]?.freePerWeek.map((w) => w.free)).toEqual([h(12), h(0)]);
  });

  it('shows a viewer who may not see the end only the capacity before it', () => {
    const list = freeList(
      [{ ...leaver, visibility: employmentEndView(mayNotSee, WED2) }],
      NO_HOLIDAYS,
      TODAY,
      2,
      h(0),
    );
    // W2: Mon–Wed 24 h capacity, 3 × 4 h allocated.
    expect(list.entries[0]?.freePerWeek.map((w) => w.free)).toEqual([h(12), h(12)]);
  });
});
