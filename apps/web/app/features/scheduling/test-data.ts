import type {
  Board,
  BoardAllocation,
  BoardCell,
  BoardRow,
  CellState,
} from '@arv/contracts/scheduling';

// A board for W47–W48 2026 (Mon 16 Nov, Mon 23 Nov) used by the scheduling tests.

export const W47 = '2026-11-16';
export const W48 = '2026-11-23';

export const TEAM_DELIVERY = { id: '01933b8e-0000-7000-8000-000000000101', name: 'Delivery' };
export const ATLAS = {
  id: '01933b8e-0000-7000-8000-000000000501',
  name: 'Atlas CRM',
  type: 'client' as const,
};
export const COBALT = {
  id: '01933b8e-0000-7000-8000-000000000502',
  name: 'Cobalt billing',
  type: 'client' as const,
};
export const SICK = {
  id: '01933b8e-0000-7000-8000-000000000509',
  name: 'Sick leave',
  type: 'leave' as const,
};

const H = 60;

export const cell = (
  weekStart: string,
  state: CellState,
  allocatedHours: number,
  capacityHours: number | null,
  leaveDays = 0,
): BoardCell => ({
  weekStart,
  state,
  allocatedMinutes: allocatedHours * H,
  capacityMinutes: capacityHours === null ? null : capacityHours * H,
  leaveDays,
});

let next = 0;
export const allocation = (
  project: BoardAllocation['project'],
  perWeek: ReadonlyArray<readonly [string, number]>,
  away = false,
): BoardAllocation => {
  next += 1;
  return {
    id: `01933b8e-0000-7000-8000-${String(700 + next).padStart(12, '0')}`,
    project,
    away,
    segments: [
      {
        startsOn: W47,
        endsOn: '2026-11-29',
        rateMinutes: away ? null : 480,
        ratePeriod: away ? 'full-day' : 'day',
      },
    ],
    minutesPerWeek: perWeek.map(([weekStart, h]) => ({ weekStart, minutes: h * H })),
    needsAttention: false,
    version: 1,
    lastChangedBy: { id: '01933b8e-0000-7000-8000-000000000201', name: 'Marko Ivanov' },
    lastChangedAt: new Date('2026-11-10T09:00:00Z'),
  };
};

export const row = (
  n: number,
  fullName: string,
  cells: ReadonlyArray<BoardCell>,
  allocations: ReadonlyArray<BoardAllocation> = [],
  extra: Partial<BoardRow> = {},
): BoardRow => ({
  employee: { id: `01933b8e-0000-7000-8000-00000000030${n}`, fullName, team: TEAM_DELIVERY },
  employmentEnd: null,
  incomplete: false,
  cells,
  allocations,
  ...extra,
});

export const board = (
  rows: ReadonlyArray<BoardRow>,
  weeks: ReadonlyArray<string> = [W47, W48],
): Board => ({
  from: weeks[0] ?? W47,
  to: '2026-11-29',
  weeks,
  rows,
});

/** One row per cell state (AC-01, AC-06, AC-21), plus redacted leave (AC-29). */
export function everyStateBoard(): Board {
  return board([
    row(
      1,
      'Olena Kovalenko',
      [cell(W47, 'free', 0, 40), cell(W48, 'partly-booked', 24, 40)],
      [allocation(ATLAS, [[W48, 24]])],
    ),
    row(
      2,
      'Taras Melnyk',
      [cell(W47, 'overbooked', 48, 40), cell(W48, 'partly-booked', 40, 40)],
      [
        allocation(ATLAS, [
          [W47, 24],
          [W48, 24],
        ]),
        allocation(COBALT, [
          [W47, 24],
          [W48, 16],
        ]),
      ],
    ),
    row(
      3,
      'Iryna Bondar',
      [cell(W47, 'non-working', 0, 0), cell(W48, 'incomplete-record', 0, null)],
      [],
      {
        employee: {
          id: '01933b8e-0000-7000-8000-000000000303',
          fullName: 'Iryna Bondar',
          team: null,
        },
        incomplete: true,
      },
    ),
    row(
      4,
      'Andrii Shevchenko',
      [cell(W47, 'needs-attention', 16, 0), cell(W48, 'partly-booked', 16, 40, 2)],
      [allocation(ATLAS, [[W47, 16]]), allocation(null, [[W48, 16]], true)],
    ),
  ]);
}
