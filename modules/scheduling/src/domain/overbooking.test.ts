import { describe, expect, it } from 'vitest';
import type { EmploymentTerms, Holidays, RateSegment } from './capacity';
import { allocationImpact, overbookedWeeks, workOnLeaveDays } from './overbooking';
import { hoursToTicks } from './ticks';
import { weeklyFigures } from './weekly-figures';

const MON = '2026-11-16';
const WED = '2026-11-18';
const THU = '2026-11-19';
const FRI = '2026-11-20';
const SUN = '2026-11-22';
const MON2 = '2026-11-23';
const SUN2 = '2026-11-29';

const NO_HOLIDAYS: Holidays = new Set();
const h = hoursToTicks;

type Alloc = { readonly id: string; readonly segments: ReadonlyArray<RateSegment> };

const fullTime: EmploymentTerms = {
  contractMinutes: 40 * 60,
  workingDays: [1, 2, 3, 4, 5],
  employmentStart: '2020-01-01',
  employmentEnd: null,
};
// AC-10: 32 hours of capacity a week, 8 hours a day Monday to Thursday.
const thirtyTwo: EmploymentTerms = {
  ...fullTime,
  contractMinutes: 32 * 60,
  workingDays: [1, 2, 3, 4],
};

const work = (
  id: string,
  period: 'day' | 'week',
  hours: number,
  startsOn: string,
  endsOn: string,
): Alloc => ({
  id,
  segments: [{ startsOn, endsOn, rateMinutes: hours * 60, ratePeriod: period }],
});
const leave = (id: string, startsOn: string, endsOn: string): Alloc => ({
  id,
  segments: [{ startsOn, endsOn, rateMinutes: null, ratePeriod: 'full-day' }],
});

describe('AC-10: overbooking warning', () => {
  it('32 h capacity, 24 h allocated, a 16 h allocation → 8 h over in that week only', () => {
    const existing = work('a', 'week', 24, MON, SUN);
    const proposed = work('new', 'week', 16, MON, SUN2);
    const impact = allocationImpact(
      { terms: thirtyTwo, allocations: [existing] },
      proposed,
      NO_HOLIDAYS,
      MON,
    );
    expect(impact.overbookedWeeks).toEqual([
      { weekStart: MON, capacity: h(32), allocated: h(40), over: h(8) },
    ]);
    expect(impact.workOnLeaveDays).toEqual([]);
  });

  it('judges an allocation starting mid-week on its whole week', () => {
    const existing = work('a', 'week', 32, MON, SUN);
    const proposed = work('new', 'day', 2, WED, THU);
    const impact = allocationImpact(
      { terms: thirtyTwo, allocations: [existing] },
      proposed,
      NO_HOLIDAYS,
      MON,
    );
    expect(impact.overbookedWeeks).toEqual([
      { weekStart: MON, capacity: h(32), allocated: h(36), over: h(4) },
    ]);
  });

  it('does not warn about weeks before today (AC-09b) or when it fits', () => {
    const existing = work('a', 'week', 24, MON, SUN);
    const proposed: Alloc = {
      id: 'x',
      segments: [
        { startsOn: MON, endsOn: SUN, rateMinutes: 16 * 60, ratePeriod: 'week' },
        { startsOn: MON2, endsOn: SUN2, rateMinutes: 8 * 60, ratePeriod: 'week' },
      ],
    };
    const impact = allocationImpact(
      { terms: thirtyTwo, allocations: [existing] },
      proposed,
      NO_HOLIDAYS,
      MON2,
    );
    expect(impact.overbookedWeeks).toEqual([]);
  });

  it('cannot overbook an incomplete record (AC-06)', () => {
    const incomplete = { ...fullTime, contractMinutes: null };
    const impact = allocationImpact(
      { terms: incomplete, allocations: [work('a', 'week', 40, MON, SUN)] },
      work('new', 'week', 40, MON, SUN),
      NO_HOLIDAYS,
      MON,
    );
    expect(impact.overbookedWeeks).toEqual([]);
  });

  it('lists only overbooked weeks, never weeks needing attention (AC-21b)', () => {
    const weeks = weeklyFigures(
      {
        terms: { ...fullTime, employmentEnd: WED },
        allocations: [work('a', 'week', 48, MON, SUN2)],
      },
      NO_HOLIDAYS,
      MON,
      SUN2,
    );
    expect(overbookedWeeks(weeks)).toEqual([]);
  });
});

describe('AC-15: work on leave days', () => {
  const twentyHours = work('w', 'week', 20, MON, SUN2);

  it('names the work on the leave days even when the week stays within capacity', () => {
    const impact = allocationImpact(
      { terms: fullTime, allocations: [twentyHours] },
      leave('l', THU, FRI),
      NO_HOLIDAYS,
      MON,
    );
    // 20 h work + 2 leave days × 8 h = 36 h ≤ 40 h.
    expect(impact.overbookedWeeks).toEqual([]);
    expect(impact.workOnLeaveDays).toEqual([{ allocation: twentyHours, days: [THU, FRI] }]);
  });

  it('a leave day takes the full daily share, so a full week of work overbooks', () => {
    const impact = allocationImpact(
      { terms: fullTime, allocations: [work('w', 'week', 40, MON, SUN)] },
      leave('l', THU, FRI),
      NO_HOLIDAYS,
      MON,
    );
    expect(impact.overbookedWeeks).toEqual([
      { weekStart: MON, capacity: h(40), allocated: h(56), over: h(16) },
    ]);
    expect(impact.workOnLeaveDays.map((c) => [c.allocation.id, c.days])).toEqual([
      ['w', [THU, FRI]],
    ]);
  });

  it('does not count a public holiday inside the leave as a conflict', () => {
    const impact = allocationImpact(
      { terms: fullTime, allocations: [twentyHours] },
      leave('l', THU, FRI),
      new Set([FRI]),
      MON,
    );
    expect(impact.workOnLeaveDays).toEqual([{ allocation: twentyHours, days: [THU] }]);
  });

  it('names a new work allocation that falls on existing leave', () => {
    const impact = allocationImpact(
      { terms: fullTime, allocations: [leave('l', THU, FRI), work('other', 'week', 8, MON, SUN)] },
      twentyHours,
      NO_HOLIDAYS,
      MON,
    );
    expect(impact.workOnLeaveDays).toEqual([{ allocation: twentyHours, days: [THU, FRI] }]);
  });

  it('ignores work outside the range and leave-only overlaps', () => {
    expect(
      workOnLeaveDays(
        [work('w', 'day', 4, MON, WED), leave('l2', THU, FRI)],
        [leave('l', THU, FRI)],
        fullTime,
        NO_HOLIDAYS,
        MON,
        SUN,
      ),
    ).toEqual([]);
  });
});
