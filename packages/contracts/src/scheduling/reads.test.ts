import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ApiErrorBody } from '../shared';
import { ValidationIssues, WindowRuleViolations } from './errors';
import {
  Allocation,
  AllocationHistoryPage,
  AllocationHistoryQuery,
  AllocationIdPath,
  Board,
  BoardQuery,
  FreeList,
  FreeListQuery,
  MySchedule,
  MyScheduleQuery,
} from './reads';

// Examples from docs/features/resource-scheduling/contracts/openapi.yaml (components.examples).
const changer = { id: '01933b8e-0000-7000-8000-000000000102', name: 'Test User 2' };
const employee = {
  id: '01933b8e-0000-7000-8000-000000000301',
  fullName: 'Test User 1',
  team: null,
};
const workSegment = {
  startsOn: '2026-11-02',
  endsOn: '2026-12-31',
  rateMinutes: 1200,
  ratePeriod: 'week',
};
const leaveSegment = {
  startsOn: '2026-11-06',
  endsOn: '2026-11-06',
  rateMinutes: null,
  ratePeriod: 'full-day',
};
const board = {
  from: '2026-11-02',
  to: '2026-11-08',
  weeks: ['2026-11-02'],
  rows: [
    {
      employee: {
        ...employee,
        team: { id: '01933b8e-0000-7000-8000-000000000201', name: 'Platform' },
      },
      employmentEnd: null,
      incomplete: false,
      cells: [
        {
          weekStart: '2026-11-02',
          state: 'partly-booked',
          allocatedMinutes: 1200,
          capacityMinutes: 2400,
          leaveDays: 1,
        },
      ],
      allocations: [
        {
          id: '01933b8e-0000-7000-8000-000000000601',
          project: {
            id: '01933b8e-0000-7000-8000-000000000501',
            name: 'Test Project',
            type: 'client',
          },
          away: false,
          segments: [workSegment],
          minutesPerWeek: [{ weekStart: '2026-11-02', minutes: 720 }],
          needsAttention: false,
          version: 1,
          lastChangedBy: changer,
          lastChangedAt: '2026-10-31T09:00:00Z',
        },
        {
          id: '01933b8e-0000-7000-8000-000000000603',
          project: null,
          away: true,
          segments: [leaveSegment],
          minutesPerWeek: [{ weekStart: '2026-11-02', minutes: 480 }],
          needsAttention: false,
          version: 1,
          lastChangedBy: changer,
          lastChangedAt: '2026-10-31T09:00:00Z',
        },
      ],
    },
  ],
};
const freeList = {
  from: '2026-11-02',
  to: '2026-11-15',
  weeks: ['2026-11-02', '2026-11-09'],
  items: [
    {
      employee,
      freeMinutesTotal: 2160,
      freeMinutesPerWeek: [
        { weekStart: '2026-11-02', minutes: 1200 },
        { weekStart: '2026-11-09', minutes: 960 },
      ],
    },
  ],
  incompleteRecords: [
    { id: '01933b8e-0000-7000-8000-000000000304', fullName: 'Test User 4', team: null },
  ],
};
const mySchedule = {
  employee,
  from: '2026-11-02',
  to: '2026-11-08',
  weeks: ['2026-11-02'],
  cells: [
    {
      weekStart: '2026-11-02',
      state: 'partly-booked',
      allocatedMinutes: 480,
      capacityMinutes: 2400,
      leaveDays: 1,
    },
  ],
  allocations: [
    {
      id: '01933b8e-0000-7000-8000-000000000603',
      project: { id: '01933b8e-0000-7000-8000-000000000502', name: 'Annual leave', type: 'leave' },
      away: true,
      segments: [leaveSegment],
      minutesPerWeek: [{ weekStart: '2026-11-02', minutes: 480 }],
      needsAttention: false,
      version: 1,
      lastChangedBy: changer,
      lastChangedAt: '2026-10-31T09:00:00Z',
    },
  ],
};
const allocation = {
  id: '01933b8e-0000-7000-8000-000000000601',
  employee,
  project: { id: '01933b8e-0000-7000-8000-000000000501', name: 'Test Project', type: 'client' },
  away: false,
  segments: [workSegment],
  needsAttention: false,
  version: 1,
  lastChangedBy: changer,
  lastChangedAt: '2026-10-31T09:00:00Z',
  createdAt: '2026-10-31T09:00:00Z',
};
const leaveAllocationRedacted = {
  ...allocation,
  id: '01933b8e-0000-7000-8000-000000000604',
  project: null,
  away: true,
  segments: [{ ...leaveSegment, startsOn: '2026-11-09', endsOn: '2026-11-13' }],
};
const historyPage = {
  items: [
    {
      id: '01933b8e-0000-7000-8000-000000000701',
      allocationId: '01933b8e-0000-7000-8000-000000000601',
      employee,
      project: { id: '01933b8e-0000-7000-8000-000000000501', name: 'Test Project', type: 'client' },
      away: false,
      changeKind: 'created',
      effectiveFrom: null,
      before: null,
      after: [{ ...workSegment, startsOn: '2026-10-01', endsOn: '2026-11-30' }],
      changedBy: changer,
      createdAt: '2026-09-30T09:00:00Z',
    },
    {
      id: '01933b8e-0000-7000-8000-000000000702',
      allocationId: '01933b8e-0000-7000-8000-000000000601',
      employee,
      project: { id: '01933b8e-0000-7000-8000-000000000501', name: 'Test Project', type: 'client' },
      away: false,
      changeKind: 'changed',
      effectiveFrom: '2026-10-28',
      before: [{ ...workSegment, startsOn: '2026-10-01', endsOn: '2026-11-30' }],
      after: [
        { ...workSegment, startsOn: '2026-10-01', endsOn: '2026-10-27' },
        { ...workSegment, startsOn: '2026-10-28', endsOn: '2026-11-30', rateMinutes: 600 },
      ],
      changedBy: { id: '01933b8e-0000-7000-8000-000000000103', name: 'Test User 3' },
      createdAt: '2026-10-28T09:00:00Z',
    },
  ],
  hasNext: false,
  hasPrev: false,
  nextCursor: null,
};
const errorExamples = [
  {
    _tag: 'Forbidden',
    code: 'scheduling.missing_permission',
    message: 'You lack the permission to view the whole board',
    details: { missingPermissions: ['scheduling:view-whole-board'] },
  },
  {
    _tag: 'ValidationError',
    code: 'scheduling.window_out_of_range',
    message: 'The board shows at most 12 months back and 52 weeks ahead',
    details: { rules: ['window_out_of_range'] },
  },
  {
    _tag: 'ValidationError',
    code: 'platform.validation_failed',
    message: 'The number of weeks must be from 1 to 12 and the free hours must be zero or more',
    details: { issues: [{ path: 'weeks', message: 'Expected a number between 1 and 12' }] },
  },
  {
    _tag: 'NotFound',
    code: 'scheduling.not_a_resource',
    message:
      'You are not set up as a resource yet; someone with the manage-employee-records permission can link you',
  },
  {
    _tag: 'NotFound',
    code: 'scheduling.allocation_not_found',
    message: 'Allocation 01933b8e-0000-7000-8000-000000000601 not found',
  },
];

const decodes = <A, I>(schema: Schema.Schema<A, I>, value: unknown) =>
  Either.isRight(Schema.decodeUnknownEither(schema)(value));

describe('scheduling read contracts accept the OpenAPI examples', () => {
  it.each([
    ['Board', Board, board],
    ['FreeList', FreeList, freeList],
    ['MySchedule', MySchedule, mySchedule],
    ['Allocation', Allocation, allocation],
    ['LeaveAllocationRedacted', Allocation, leaveAllocationRedacted],
    ['AllocationHistoryPage', AllocationHistoryPage, historyPage],
    ['WindowRuleViolations', WindowRuleViolations, { rules: ['window_out_of_range'] }],
    ['ValidationIssues', ValidationIssues, errorExamples[2]?.details],
  ] as const)('%s', (_, schema, example) => {
    expect(decodes(schema as Schema.Schema<unknown, unknown>, example)).toBe(true);
  });

  it.each(errorExamples)('error $code', (error) => {
    expect(decodes(ApiErrorBody, { error })).toBe(true);
  });

  it('round-trips the Board example unchanged', () => {
    const decoded = Schema.decodeUnknownSync(Board)(board);
    expect(Schema.encodeSync(Board)(decoded)).toEqual({
      ...board,
      rows: board.rows.map((row) => ({
        ...row,
        allocations: row.allocations.map((a) => ({
          ...a,
          lastChangedAt: '2026-10-31T09:00:00.000Z',
        })),
      })),
    });
  });
});

describe('scheduling read responses refuse what the contract forbids', () => {
  it('an allocation without segments', () => {
    expect(decodes(Allocation, { ...allocation, segments: [] })).toBe(false);
  });

  it('a rate that is not a quarter hour', () => {
    expect(
      decodes(Allocation, { ...allocation, segments: [{ ...workSegment, rateMinutes: 1201 }] }),
    ).toBe(false);
  });

  it('an unknown cell state', () => {
    const row = board.rows[0];
    const cell = { ...row?.cells[0], state: 'busy' };
    expect(decodes(Board, { ...board, rows: [{ ...row, cells: [cell] }] })).toBe(false);
  });
});

describe('scheduling read queries', () => {
  it('the board takes a window and filters, weeks as a query string from 1 to 12', () => {
    expect(
      Schema.decodeUnknownSync(BoardQuery)({
        from: '2026-11-04',
        weeks: '4',
        teamId: board.rows[0]?.employee.team?.id,
      }),
    ).toEqual({ from: '2026-11-04', weeks: 4, teamId: board.rows[0]?.employee.team?.id });
    expect(Schema.decodeUnknownSync(BoardQuery)({})).toEqual({});
    expect(decodes(BoardQuery, { weeks: '13' })).toBe(false);
    expect(decodes(BoardQuery, { weeks: '0' })).toBe(false);
    expect(decodes(BoardQuery, { from: '2026-02-30' })).toBe(false);
    expect(decodes(BoardQuery, { projectId: '42' })).toBe(false);
  });

  it('my schedule takes the same window', () => {
    expect(Schema.decodeUnknownSync(MyScheduleQuery)({ weeks: '12' })).toEqual({ weeks: 12 });
    expect(decodes(MyScheduleQuery, { weeks: '1.5' })).toBe(false);
  });

  it('the free list takes both values raw, so the server words every bad value (AC-05)', () => {
    expect(decodes(FreeListQuery, { weeks: '13', minFreeHours: '-1' })).toBe(true);
    expect(decodes(FreeListQuery, { weeks: '2' })).toBe(false);
  });

  it('history takes a page, the path a uuid', () => {
    expect(Schema.decodeUnknownSync(AllocationHistoryQuery)({ limit: '20' })).toEqual({
      limit: 20,
    });
    expect(decodes(AllocationIdPath, { allocationId: allocation.id })).toBe(true);
    expect(decodes(AllocationIdPath, { allocationId: '42' })).toBe(false);
  });
});
