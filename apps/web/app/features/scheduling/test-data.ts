import type {
  Board,
  BoardAllocation,
  BoardCell,
  BoardRow,
  CellState,
  MySchedule,
} from '@arv/contracts/scheduling';
import type { HistoryEntry } from './history';

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

/** Olena's own schedule for W47–W48: work, and her own sick leave named with its type (AC-17). */
export function mySchedule(): MySchedule {
  return {
    employee: {
      id: '01933b8e-0000-7000-8000-000000000301',
      fullName: 'Olena Kovalenko',
      team: TEAM_DELIVERY,
    },
    from: W47,
    to: '2026-11-29',
    weeks: [W47, W48],
    cells: [cell(W47, 'partly-booked', 24, 40), cell(W48, 'partly-booked', 32, 40, 2)],
    allocations: [
      allocation(ATLAS, [
        [W47, 24],
        [W48, 16],
      ]),
      allocation(SICK, [[W48, 16]], true),
    ],
  };
}

// ---------- allocation history (T42) ----------

// History entries for the T42 tests: Atlas CRM for Olena, imported, trimmed when Atlas closed,
// then changed; and Sofia's leave as a viewer without see-leave-reasons gets it (AC-29).

const HISTORY_OLENA = {
  id: '01933b8e-0000-7000-8000-000000000301',
  fullName: 'Olena Kovalenko',
  team: null,
};
const SOFIA = {
  id: '01933b8e-0000-7000-8000-000000000302',
  fullName: 'Sofia Lys',
  team: null,
};
const MARKO = { id: '01933b8e-0000-7000-8000-000000000201', name: 'Marko Ivanov' };
const ANDRII = { id: '01933b8e-0000-7000-8000-000000000202', name: 'Andrii Melnyk' };

export const ATLAS_ALLOCATION = '01933b8e-0000-7000-8000-000000000601';
export const LEAVE_ALLOCATION = '01933b8e-0000-7000-8000-000000000602';

const week = (startsOn: string, endsOn: string, hours: number) => ({
  startsOn,
  endsOn,
  rateMinutes: hours * 60,
  ratePeriod: 'week' as const,
});

const away = (startsOn: string, endsOn: string) => ({
  startsOn,
  endsOn,
  rateMinutes: null,
  ratePeriod: 'full-day' as const,
});

/** Atlas CRM's history, oldest first, as the api sends it. */
export const atlasHistory: ReadonlyArray<HistoryEntry> = [
  {
    id: '01933b8e-0000-7000-8000-000000000801',
    allocationId: ATLAS_ALLOCATION,
    employee: HISTORY_OLENA,
    project: ATLAS,
    away: false,
    changeKind: 'imported',
    effectiveFrom: null,
    before: null,
    after: [week('2026-10-01', '2026-12-31', 20)],
    changedBy: ANDRII,
    createdAt: '2026-09-28T16:40:00.000Z',
  },
  {
    id: '01933b8e-0000-7000-8000-000000000802',
    allocationId: ATLAS_ALLOCATION,
    employee: HISTORY_OLENA,
    project: ATLAS,
    away: false,
    changeKind: 'trimmed',
    effectiveFrom: '2026-12-01',
    before: [week('2026-10-01', '2026-12-31', 20)],
    after: [week('2026-10-01', '2026-11-30', 20)],
    changedBy: ANDRII,
    createdAt: '2026-11-02T10:15:00.000Z',
  },
  {
    id: '01933b8e-0000-7000-8000-000000000803',
    allocationId: ATLAS_ALLOCATION,
    employee: HISTORY_OLENA,
    project: ATLAS,
    away: false,
    changeKind: 'changed',
    effectiveFrom: '2026-11-18',
    before: [week('2026-10-01', '2026-11-30', 20)],
    after: [week('2026-10-01', '2026-11-17', 20), week('2026-11-18', '2026-11-30', 10)],
    changedBy: MARKO,
    createdAt: '2026-11-18T14:32:00.000Z',
  },
];

/** Sofia's sick leave as a viewer without see-leave-reasons gets it: no project (AC-29). */
export const redactedLeaveHistory: ReadonlyArray<HistoryEntry> = [
  {
    id: '01933b8e-0000-7000-8000-000000000811',
    allocationId: LEAVE_ALLOCATION,
    employee: SOFIA,
    project: null,
    away: true,
    changeKind: 'created',
    effectiveFrom: null,
    before: null,
    after: [away('2026-11-12', '2026-11-12')],
    changedBy: MARKO,
    createdAt: '2026-11-12T08:05:00.000Z',
  },
  {
    id: '01933b8e-0000-7000-8000-000000000812',
    allocationId: LEAVE_ALLOCATION,
    employee: SOFIA,
    project: null,
    away: true,
    changeKind: 'changed',
    effectiveFrom: '2026-11-13',
    before: [away('2026-11-12', '2026-11-12')],
    after: [away('2026-11-12', '2026-11-13')],
    changedBy: MARKO,
    createdAt: '2026-11-13T09:20:00.000Z',
  },
];

/** The same leave for a viewer who may see its type. */
export const visibleLeaveHistory: ReadonlyArray<HistoryEntry> = redactedLeaveHistory.map((e) => ({
  ...e,
  project: SICK,
}));
