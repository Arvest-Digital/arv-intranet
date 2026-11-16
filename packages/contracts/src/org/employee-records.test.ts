import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ApiErrorBody } from '../shared';
import {
  EmployeeRecord,
  EmployeeRecordChange,
  EmployeeRecordCreate,
  EmployeeRecordPage,
} from './employee-records';
import {
  CapacityImpact,
  EmployeeRecordConflictDetails,
  EmployeeRecordRuleViolations,
  LoginAlreadyLinkedDetails,
  OrgErrorCode,
} from './errors';

// Examples from docs/features/resource-scheduling/contracts/openapi.yaml (components.examples).
const record = {
  id: '01933b8e-0000-7000-8000-000000000301',
  fullName: 'Test User 1',
  userId: '01933b8e-0000-7000-8000-000000000101',
  team: { id: '01933b8e-0000-7000-8000-000000000201', name: 'Platform' },
  contractMinutes: 2400,
  workingDays: [1, 2, 3, 4, 5],
  employmentStart: '2026-11-02',
  employmentEnd: null,
  incomplete: false,
  version: 1,
  lastChangedBy: { id: '01933b8e-0000-7000-8000-000000000102', name: 'Test User 2' },
  lastChangedAt: '2026-10-31T09:00:00Z',
  createdAt: '2026-10-31T09:00:00Z',
};
const page = {
  items: [
    {
      ...record,
      userId: null,
      team: null,
      contractMinutes: null,
      employmentStart: null,
      incomplete: true,
    },
  ],
  hasNext: false,
  hasPrev: false,
  nextCursor: null,
};
const create = {
  fullName: 'Test User 1',
  userId: '01933b8e-0000-7000-8000-000000000101',
  teamId: '01933b8e-0000-7000-8000-000000000201',
  contractMinutes: 2400,
  workingDays: [1, 2, 3, 4, 5],
  employmentStart: '2026-11-02',
  employmentEnd: null,
};
const change = { version: 2, contractMinutes: 1440, workingDays: [1, 2, 3], confirm: false };
const errorExamples = {
  invalid: {
    error: {
      _tag: 'ValidationError',
      code: 'org.invalid_employee_record',
      message: 'The end date is before the start date',
      details: { rules: ['end_before_start'] },
    },
  },
  linked: {
    error: {
      _tag: 'Conflict',
      code: 'org.login_already_linked',
      message: 'This login is already linked to Test User 3',
      details: {
        employeeRecord: {
          id: '01933b8e-0000-7000-8000-000000000303',
          fullName: 'Test User 3',
          team: null,
        },
      },
    },
  },
  versionConflict: {
    error: {
      _tag: 'Conflict',
      code: 'org.version_conflict',
      message: 'Test User 2 changed this record meanwhile',
      details: {
        current: {
          ...record,
          userId: null,
          team: null,
          contractMinutes: 1920,
          workingDays: [1, 2, 3, 4],
          version: 3,
        },
      },
    },
  },
  confirm: {
    error: {
      _tag: 'ConfirmationRequired',
      code: 'org.capacity_confirmation_required',
      message: '1 resource-week would become overbooked',
      details: {
        overbookedWeeks: [
          {
            employee: {
              id: '01933b8e-0000-7000-8000-000000000301',
              fullName: 'Test User 1',
              team: null,
            },
            weekStart: '2026-11-09',
            overMinutes: 480,
          },
        ],
      },
    },
  },
};

const decodes = <A, I>(schema: Schema.Schema<A, I>, value: unknown) =>
  Either.isRight(Schema.decodeUnknownEither(schema)(value));

describe('employee-record contract examples', () => {
  it('decodes the record, page, create and change examples', () => {
    expect(decodes(EmployeeRecord, record)).toBe(true);
    expect(decodes(EmployeeRecordPage, page)).toBe(true);
    expect(decodes(EmployeeRecordCreate, create)).toBe(true);
    expect(decodes(EmployeeRecordChange, change)).toBe(true);
  });

  it('round-trips a record: encoding gives ISO timestamps again', () => {
    const decoded = Schema.decodeUnknownSync(EmployeeRecord)(record);
    expect(Schema.encodeSync(EmployeeRecord)(decoded)).toEqual({
      ...record,
      lastChangedAt: '2026-10-31T09:00:00.000Z',
      createdAt: '2026-10-31T09:00:00.000Z',
    });
  });

  it.each(Object.entries(errorExamples))(
    'error example %s is an ApiErrorBody with an org code',
    (_, body) => {
      expect(decodes(ApiErrorBody, body)).toBe(true);
      expect(decodes(OrgErrorCode, body.error.code)).toBe(true);
    },
  );

  it('error details match their code’s schema', () => {
    expect(decodes(EmployeeRecordRuleViolations, errorExamples.invalid.error.details)).toBe(true);
    expect(decodes(LoginAlreadyLinkedDetails, errorExamples.linked.error.details)).toBe(true);
    expect(
      decodes(EmployeeRecordConflictDetails, errorExamples.versionConflict.error.details),
    ).toBe(true);
    expect(decodes(CapacityImpact, errorExamples.confirm.error.details)).toBe(true);
  });
});

describe('employee-record request rules (AC-20)', () => {
  it('needs only a name to create (incomplete record, AC-06)', () => {
    expect(decodes(EmployeeRecordCreate, { fullName: 'Test User 1' })).toBe(true);
  });

  it.each([
    ['0 contract minutes', { contractMinutes: 0 }],
    ['above 60 hours', { contractMinutes: 3601 }],
    ['a fraction of a minute', { contractMinutes: 2400.5 }],
    ['no working day', { workingDays: [] }],
    ['a weekday twice', { workingDays: [1, 1] }],
    ['weekday 8', { workingDays: [8] }],
    ['a date that does not exist', { employmentStart: '2026-02-30' }],
    ['an untrimmed name', { fullName: ' Test User 1' }],
    ['an unknown field', { contractHours: 40 }],
  ])('refuses %s', (_, override) => {
    expect(decodes(EmployeeRecordCreate, { ...create, ...override })).toBe(false);
  });

  it('names the broken hours rule in the message', () => {
    const result = Schema.decodeUnknownEither(EmployeeRecordCreate)({
      ...create,
      contractMinutes: 0,
    });
    expect(Either.isLeft(result) && String(result.left)).toContain(
      'Contract hours must be above 0 and at most 60 a week',
    );
  });

  it('a change needs the version it was opened at; null clears, absent keeps', () => {
    expect(decodes(EmployeeRecordChange, { contractMinutes: 1440 })).toBe(false);
    expect(
      Schema.decodeUnknownSync(EmployeeRecordChange)({ version: 1, employmentEnd: null }),
    ).toEqual({ version: 1, employmentEnd: null });
  });
});
