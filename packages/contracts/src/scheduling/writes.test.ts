import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ApiErrorBody } from '../shared';
import {
  AllocationChange,
  AllocationConflictDetails,
  AllocationCreate,
  AllocationImpact,
  AllocationRemoval,
  AllocationRemovalQuery,
  AllocationRuleViolations,
  LeaveBooking,
} from './writes';

// Examples from docs/features/resource-scheduling/contracts/openapi.yaml (components.examples).
const project = {
  id: '01933b8e-0000-7000-8000-000000000501',
  name: 'Test Project',
  type: 'client',
};
const allocationCreate = {
  employeeId: '01933b8e-0000-7000-8000-000000000301',
  projectId: '01933b8e-0000-7000-8000-000000000501',
  startsOn: '2026-11-02',
  endsOn: '2026-12-31',
  rateMinutes: 1200,
  ratePeriod: 'week',
  confirm: false,
};
const allocationChange = { version: 1, rateMinutes: 600, ratePeriod: 'week', confirm: false };
const allocationRemoval = {
  allocationId: '01933b8e-0000-7000-8000-000000000601',
  outcome: 'ended',
  endsOn: '2026-10-30',
};
const leaveBooking = {
  employeeId: '01933b8e-0000-7000-8000-000000000301',
  projectId: '01933b8e-0000-7000-8000-000000000502',
  startsOn: '2026-11-09',
  endsOn: '2026-11-13',
  confirm: false,
};
const current = {
  id: '01933b8e-0000-7000-8000-000000000601',
  employee: { id: '01933b8e-0000-7000-8000-000000000301', fullName: 'Test User 1', team: null },
  project,
  away: false,
  segments: [
    { startsOn: '2026-11-02', endsOn: '2026-12-31', rateMinutes: 960, ratePeriod: 'week' },
  ],
  needsAttention: false,
  version: 2,
  lastChangedBy: { id: '01933b8e-0000-7000-8000-000000000102', name: 'Test User 2' },
  lastChangedAt: '2026-10-31T09:05:00Z',
  createdAt: '2026-10-31T09:00:00Z',
};

const errorExamples = {
  invalid: {
    _tag: 'ValidationError',
    code: 'scheduling.invalid_allocation',
    message: 'The end date is before the start date',
    details: { rules: ['end_before_start'] },
  },
  outside: {
    _tag: 'ValidationError',
    code: 'scheduling.outside_employment_period',
    message:
      "The allocation falls outside the resource's employment period; the last date they can be allocated is 2026-11-15",
    details: { rules: ['outside_employment_period'], lastBookableDate: '2026-11-15' },
  },
  past: {
    _tag: 'ValidationError',
    code: 'scheduling.past_not_rewritable',
    message: 'Past plans are not rewritten; only today onwards can change',
    details: { rules: ['starts_before_today'] },
  },
  notLeave: {
    _tag: 'ValidationError',
    code: 'scheduling.not_a_leave_project',
    message: 'Leave can only be booked on a leave-type project',
    details: { rules: ['not_a_leave_project'] },
  },
  closed: {
    _tag: 'Conflict',
    code: 'scheduling.project_closed',
    message: 'The project is closed and accepts no new, changed or removed allocations',
  },
  confirm: {
    _tag: 'ConfirmationRequired',
    code: 'scheduling.overbooking_confirmation_required',
    message: 'The resource will be overbooked in 1 week',
    details: {
      overbookedWeeks: [
        {
          weekStart: '2026-11-09',
          capacityMinutes: 1920,
          allocatedMinutes: 2400,
          overMinutes: 480,
        },
      ],
      workOnLeaveDays: [],
    },
  },
  leaveConfirm: {
    _tag: 'ConfirmationRequired',
    code: 'scheduling.overbooking_confirmation_required',
    message: '1 work allocation falls on the leave days',
    details: {
      overbookedWeeks: [],
      workOnLeaveDays: [
        { allocationId: '01933b8e-0000-7000-8000-000000000601', project, days: ['2026-11-06'] },
      ],
    },
  },
  versionConflict: {
    _tag: 'Conflict',
    code: 'scheduling.version_conflict',
    message: 'Test User 2 changed this allocation meanwhile',
    details: { current },
  },
} as const;

const decodes = <A, I>(schema: Schema.Schema<A, I>, value: unknown) =>
  Either.isRight(Schema.decodeUnknownEither(schema)(value));

describe('scheduling write contracts accept the OpenAPI examples', () => {
  it.each([
    ['AllocationCreate', AllocationCreate, allocationCreate],
    ['AllocationChange', AllocationChange, allocationChange],
    ['AllocationRemoval', AllocationRemoval, allocationRemoval],
    ['LeaveBooking', LeaveBooking, leaveBooking],
    ['RuleViolations (invalid)', AllocationRuleViolations, errorExamples.invalid.details],
    ['RuleViolations (outside)', AllocationRuleViolations, errorExamples.outside.details],
    ['RuleViolations (past)', AllocationRuleViolations, errorExamples.past.details],
    ['RuleViolations (not leave)', AllocationRuleViolations, errorExamples.notLeave.details],
    ['AllocationImpact (overbooked)', AllocationImpact, errorExamples.confirm.details],
    ['AllocationImpact (work on leave)', AllocationImpact, errorExamples.leaveConfirm.details],
    ['AllocationConflictDetails', AllocationConflictDetails, errorExamples.versionConflict.details],
  ] as const)('%s', (_, schema, example) => {
    expect(decodes(schema as Schema.Schema<unknown, unknown>, example)).toBe(true);
  });

  it.each(Object.entries(errorExamples))('error %s', (_, error) => {
    expect(decodes(ApiErrorBody, { error })).toBe(true);
  });
});

describe('scheduling write bodies refuse what the contract forbids', () => {
  it('unknown keys (additionalProperties: false)', () => {
    expect(decodes(AllocationCreate, { ...allocationCreate, version: 1 })).toBe(false);
    expect(decodes(LeaveBooking, { ...leaveBooking, rateMinutes: 480 })).toBe(false);
  });

  it('a rate that is not a quarter hour, zero or past a week', () => {
    expect(decodes(AllocationCreate, { ...allocationCreate, rateMinutes: 1201 })).toBe(false);
    expect(decodes(AllocationCreate, { ...allocationCreate, rateMinutes: 0 })).toBe(false);
    expect(decodes(AllocationCreate, { ...allocationCreate, rateMinutes: 10095 })).toBe(false);
  });

  it('full-day is leave only', () => {
    expect(decodes(AllocationCreate, { ...allocationCreate, ratePeriod: 'full-day' })).toBe(false);
    expect(decodes(AllocationChange, { version: 1, ratePeriod: 'full-day' })).toBe(false);
  });

  it('a change needs the version it was opened at; confirm is optional', () => {
    expect(decodes(AllocationChange, { rateMinutes: 600 })).toBe(false);
    expect(decodes(AllocationChange, { version: 0 })).toBe(false);
    expect(Schema.decodeUnknownSync(AllocationChange)({ version: 2 })).toEqual({ version: 2 });
  });

  it('removal takes the version as a query string', () => {
    expect(Schema.decodeUnknownSync(AllocationRemovalQuery)({ version: '3' })).toEqual({
      version: 3,
    });
    expect(decodes(AllocationRemovalQuery, {})).toBe(false);
    expect(decodes(AllocationRemovalQuery, { version: '0' })).toBe(false);
    expect(decodes(AllocationRemovalQuery, { version: 'x' })).toBe(false);
  });

  it('work on leave days for the allocation being created has no id yet', () => {
    expect(
      decodes(AllocationImpact, {
        overbookedWeeks: [],
        workOnLeaveDays: [{ allocationId: null, project, days: ['2026-11-06'] }],
      }),
    ).toBe(true);
  });
});
