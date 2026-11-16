import { ApiErrorBody } from '@arv/contracts/shared';
import { EmployeeId, UserId } from '@arv/kernel';
import { toHttpError } from '@arv/platform/http';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import type { EmployeeRecordView } from '../application/employee-records';
import { EmployeeRecord } from '../domain/employee-record';
import {
  ContractHoursOutOfRange,
  EmploymentEndsBeforeStart,
  InvalidEmployeeRecord,
  NoWorkingDay,
  UserNotFound,
} from '../domain/errors';
import { TeamId } from '../domain/team';
import {
  capacityConfirmationRequired,
  employeeRecordVersionConflict,
  loginAlreadyLinked,
  presentEmployeeRecord,
  toEmployeeRecordContractError,
} from './presenter';

const ids = {
  record: EmployeeId.make('01933b8e-0000-7000-8000-000000000301'),
  holder: EmployeeId.make('01933b8e-0000-7000-8000-000000000303'),
  login: UserId.make('01933b8e-0000-7000-8000-000000000101'),
  changer: UserId.make('01933b8e-0000-7000-8000-000000000102'),
  team: TeamId.make('01933b8e-0000-7000-8000-000000000201'),
};

const record = new EmployeeRecord({
  id: ids.record,
  fullName: 'Test User 1',
  userId: ids.login,
  teamId: ids.team,
  contractMinutes: 2400,
  workingDays: [1, 2, 3, 4, 5],
  employmentStart: '2026-11-02',
  employmentEnd: '2027-03-31',
  version: 1,
  lastChangedBy: ids.changer,
  lastChangedAt: new Date('2026-10-31T09:00:00Z'),
  createdAt: new Date('2026-10-31T09:00:00Z'),
});

const view: EmployeeRecordView = {
  record,
  team: { id: ids.team, name: 'Platform' },
  lastChangedBy: { id: ids.changer, name: 'Test User 2' },
};

/** The wire body `runEffect` would answer, checked against `ApiErrorBody`. */
const body = (error: Parameters<typeof toHttpError>[0]) => {
  const { status, body: raw } = toHttpError(error);
  return { status, error: Schema.decodeUnknownSync(ApiErrorBody)(raw).error };
};

describe('presentEmployeeRecord', () => {
  it('answers the contract shape, with the end date and the incomplete flag', () => {
    expect(presentEmployeeRecord(view)).toEqual({
      id: ids.record,
      fullName: 'Test User 1',
      userId: ids.login,
      team: { id: ids.team, name: 'Platform' },
      contractMinutes: 2400,
      workingDays: [1, 2, 3, 4, 5],
      employmentStart: '2026-11-02',
      employmentEnd: '2027-03-31',
      incomplete: false,
      version: 1,
      lastChangedBy: { id: ids.changer, name: 'Test User 2' },
      lastChangedAt: '2026-10-31T09:00:00.000Z',
      createdAt: '2026-10-31T09:00:00.000Z',
    });
  });

  it('marks a record without contract hours incomplete and names a removed changer', () => {
    const incomplete = new EmployeeRecord({ ...record, contractMinutes: null });
    expect(
      presentEmployeeRecord({
        ...view,
        record: incomplete,
        lastChangedBy: { id: ids.changer, name: null },
      }),
    ).toMatchObject({ incomplete: true, lastChangedBy: { name: 'Former user' } });
  });
});

describe('employee-record errors', () => {
  it('end before start → 400 org.invalid_employee_record with rules (AC-20)', () => {
    const error = new InvalidEmployeeRecord({
      violations: [
        new EmploymentEndsBeforeStart({
          employmentStart: '2026-11-02',
          employmentEnd: '2026-11-01',
        }),
      ],
    });
    expect(body(toEmployeeRecordContractError(error))).toEqual({
      status: 400,
      error: {
        _tag: 'ValidationError',
        code: 'org.invalid_employee_record',
        message: 'The end date is before the start date',
        details: { rules: ['end_before_start'] },
      },
    });
  });

  it('rules the schema checks answer platform.validation_failed naming each field', () => {
    const error = new InvalidEmployeeRecord({
      violations: [new ContractHoursOutOfRange({ contractMinutes: 0 }), new NoWorkingDay()],
    });
    const { status, error: wire } = body(toEmployeeRecordContractError(error));
    expect(status).toBe(400);
    expect(wire).toMatchObject({
      _tag: 'ValidationError',
      code: 'platform.validation_failed',
      details: {
        issues: [
          { path: 'contractMinutes', message: expect.stringContaining('Contract hours') },
          { path: 'workingDays', message: 'Choose at least one working day' },
        ],
      },
    });
  });

  it('an unknown login → 404 org.user_not_found', () => {
    expect(body(toEmployeeRecordContractError(new UserNotFound({ id: ids.login })))).toEqual({
      status: 404,
      error: {
        _tag: 'NotFound',
        code: 'org.user_not_found',
        message: `Login ${ids.login} not found`,
      },
    });
  });

  it('a linked login → 409 naming the record it belongs to (AC-19b)', () => {
    const holder = { id: ids.holder, fullName: 'Test User 3', team: null };
    expect(body(loginAlreadyLinked(holder))).toEqual({
      status: 409,
      error: {
        _tag: 'Conflict',
        code: 'org.login_already_linked',
        message: 'This login is already linked to Test User 3',
        details: { employeeRecord: holder },
      },
    });
  });

  it('a stale version → 409 with the current values and who changed them', () => {
    const { status, error } = body(employeeRecordVersionConflict(view));
    expect(status).toBe(409);
    expect(error).toEqual({
      _tag: 'Conflict',
      code: 'org.version_conflict',
      message: 'Test User 2 changed this record meanwhile',
      details: { current: presentEmployeeRecord(view) },
    });
  });

  it('new overbooked weeks → 409 ConfirmationRequired listing each resource-week (AC-19c)', () => {
    const ref = { id: ids.record, fullName: 'Test User 1', team: null };
    const weeks = [{ employeeId: ids.record, weekStart: '2026-11-09', overMinutes: 480 }];
    expect(body(capacityConfirmationRequired(weeks, new Map([[ids.record, ref]])))).toEqual({
      status: 409,
      error: {
        _tag: 'ConfirmationRequired',
        code: 'org.capacity_confirmation_required',
        message: '1 resource-week would become overbooked',
        details: {
          overbookedWeeks: [{ employee: ref, weekStart: '2026-11-09', overMinutes: 480 }],
        },
      },
    });
  });
});
