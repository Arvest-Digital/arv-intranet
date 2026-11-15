import { Option } from 'effect';
import { describe, expect, it } from 'vitest';
import { EDIT_ALLOCATIONS } from '../permissions';
import type { EmploymentTerms, Holidays, RateSegment } from './capacity';
import { hoursToTicks } from './ticks';
import { employmentEndView, type Viewer } from './visibility';
import {
  type CellState,
  dailyFigures,
  runsPastEmploymentEnd,
  type ScheduledAllocation,
  weeklyFigures,
} from './weekly-figures';

// The weeks of Monday 16 and Monday 23 November 2026.
const MON = '2026-11-16';
const WED = '2026-11-18';
const THU = '2026-11-19';
const FRI = '2026-11-20';
const SUN = '2026-11-22';
const MON2 = '2026-11-23';
const SUN2 = '2026-11-29';

const NO_HOLIDAYS: Holidays = new Set();

const terms = (overrides: Partial<EmploymentTerms> = {}): EmploymentTerms => ({
  contractMinutes: 40 * 60,
  workingDays: [1, 2, 3, 4, 5],
  employmentStart: '2020-01-01',
  employmentEnd: null,
  ...overrides,
});

const weekly = (hours: number, startsOn = MON, endsOn = SUN2): ScheduledAllocation => ({
  segments: [{ startsOn, endsOn, rateMinutes: hours * 60, ratePeriod: 'week' }],
});

const leave = (startsOn: string, endsOn: string): ScheduledAllocation => ({
  segments: [{ startsOn, endsOn, rateMinutes: null, ratePeriod: 'full-day' } as RateSegment],
});

const h = hoursToTicks;

describe('AC-01 / AC-06: exactly one state per board cell', () => {
  it.each<{
    name: string;
    terms?: Partial<EmploymentTerms>;
    allocations: ScheduledAllocation[];
    holidays?: string[];
    capacity: number | null;
    allocated: number;
    leaveDays: number;
    state: CellState;
  }>([
    {
      name: 'nothing allocated',
      allocations: [],
      capacity: 40,
      allocated: 0,
      leaveDays: 0,
      state: 'free',
    },
    {
      name: '20/40',
      allocations: [weekly(20)],
      capacity: 40,
      allocated: 20,
      leaveDays: 0,
      state: 'partly-booked',
    },
    {
      name: '«40/40» is partly booked, not overbooked',
      allocations: [weekly(24), weekly(16)],
      capacity: 40,
      allocated: 40,
      leaveDays: 0,
      state: 'partly-booked',
    },
    {
      name: '48/40',
      allocations: [weekly(40), weekly(8)],
      capacity: 40,
      allocated: 48,
      leaveDays: 0,
      state: 'overbooked',
    },
    {
      name: 'before the employment start',
      terms: { employmentStart: '2026-12-01' },
      allocations: [],
      capacity: 0,
      allocated: 0,
      leaveDays: 0,
      state: 'non-working',
    },
    {
      name: 'a week of public holidays',
      holidays: ['2026-11-16', '2026-11-17', WED, THU, FRI],
      allocations: [],
      capacity: 0,
      allocated: 0,
      leaveDays: 0,
      state: 'non-working',
    },
    {
      name: 'no contract hours, even with work',
      terms: { contractMinutes: null },
      allocations: [weekly(20)],
      capacity: null,
      allocated: 20,
      leaveDays: 0,
      state: 'incomplete-record',
    },
    {
      name: 'no start date',
      terms: { employmentStart: null },
      allocations: [],
      capacity: null,
      allocated: 0,
      leaveDays: 0,
      state: 'incomplete-record',
    },
    {
      name: 'leave of unknown size on an incomplete record',
      terms: { contractMinutes: null },
      allocations: [leave(THU, FRI)],
      capacity: null,
      allocated: 0,
      leaveDays: 2,
      state: 'incomplete-record',
    },
    {
      name: 'two leave days next to 20 h work',
      allocations: [weekly(20), leave(THU, FRI)],
      capacity: 40,
      allocated: 36,
      leaveDays: 2,
      state: 'partly-booked',
    },
    {
      name: 'leave over a public holiday takes no day',
      holidays: [FRI],
      allocations: [leave(THU, FRI)],
      capacity: 32,
      allocated: 8,
      leaveDays: 1,
      state: 'partly-booked',
    },
    {
      name: 'part-timer Mon–Wed, 24 h fully booked',
      terms: { contractMinutes: 24 * 60, workingDays: [1, 2, 3] },
      allocations: [weekly(24)],
      capacity: 24,
      allocated: 24,
      leaveDays: 0,
      state: 'partly-booked',
    },
  ])('$name → $state', (row) => {
    const [week] = weeklyFigures(
      { terms: terms(row.terms), allocations: row.allocations },
      new Set(row.holidays ?? []),
      MON,
      SUN,
    );
    expect(week).toMatchObject({
      weekStart: MON,
      capacity: row.capacity === null ? Option.none() : Option.some(h(row.capacity)),
      allocated: h(row.allocated),
      leaveDays: row.leaveDays,
      needsAttention: false,
      state: row.state,
    });
  });

  it('sums per-day figures into each ISO week of the window (AC-08)', () => {
    const weeks = weeklyFigures(
      { terms: terms(), allocations: [weekly(40, WED)] },
      new Set([THU]),
      MON,
      SUN2,
    );
    expect(weeks.map((w) => [w.weekStart, w.allocated, w.capacity])).toEqual([
      [MON, h(16), Option.some(h(32))],
      [MON2, h(40), Option.some(h(40))],
    ]);
  });

  it('marks leave days as away, but not a public holiday inside the leave', () => {
    const days = dailyFigures(
      { terms: terms(), allocations: [leave(THU, SUN)] },
      new Set([FRI]),
      WED,
      SUN,
    );
    expect(days.map((d) => [d.date, d.away])).toEqual([
      [WED, false],
      [THU, true],
      [FRI, false],
      ['2026-11-21', false],
      [SUN, false],
    ]);
  });
});

describe('AC-21 / AC-21b / AC-22: allocations past the employment end', () => {
  const endsWednesday = terms({ employmentEnd: WED });
  const schedule = { terms: endsWednesday, allocations: [weekly(40)] };
  const mayNotSee: Viewer = { permissions: new Set(), ownEmployeeId: null };
  const maySee: Viewer = { permissions: new Set([EDIT_ALLOCATIONS]), ownEmployeeId: null };

  it('shows the weeks with hours past the end as needing attention, not overbooked', () => {
    const weeks = weeklyFigures(schedule, NO_HOLIDAYS, MON, SUN2, employmentEndView(maySee, WED));
    expect(weeks.map((w) => [w.weekStart, w.capacity, w.allocated, w.state])).toEqual([
      [MON, Option.some(h(24)), h(40), 'needs-attention'],
      [MON2, Option.some(h(0)), h(40), 'needs-attention'],
    ]);
  });

  it('hides the hours past the end from a viewer who may not see it: zero capacity, nothing booked', () => {
    const weeks = weeklyFigures(
      schedule,
      NO_HOLIDAYS,
      MON,
      SUN2,
      employmentEndView(mayNotSee, WED),
    );
    expect(
      weeks.map((w) => [w.weekStart, w.capacity, w.allocated, w.needsAttention, w.state]),
    ).toEqual([
      [MON, Option.some(h(24)), h(24), false, 'partly-booked'],
      [MON2, Option.some(h(0)), h(0), false, 'non-working'],
    ]);
  });

  it('keeps an allocation that ends by the end date unmarked', () => {
    const [week] = weeklyFigures(
      { terms: endsWednesday, allocations: [weekly(40, MON, WED)] },
      NO_HOLIDAYS,
      MON,
      SUN,
    );
    expect(week?.state).toBe('partly-booked');
  });

  it.each([
    { name: 'runs past the end', endsOn: THU, employmentEnd: WED, marked: true },
    { name: 'ends on the end date', endsOn: WED, employmentEnd: WED, marked: false },
    { name: 'open-ended employment', endsOn: SUN2, employmentEnd: null, marked: false },
  ])('marks an allocation that $name: $marked', ({ endsOn, employmentEnd, marked }) => {
    expect(runsPastEmploymentEnd(weekly(8, MON, endsOn), terms({ employmentEnd }))).toBe(marked);
  });
});
