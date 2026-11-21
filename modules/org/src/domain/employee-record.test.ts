import { EmployeeId, UserId } from '@arv/kernel';
import { Either } from 'effect';
import { describe, expect, it } from 'vitest';
import type { IsoWeekday } from './calendar';
import {
  checkVersion,
  EmployeeRecord,
  EmployeeRecordVersionConflict,
  type EmployeeTermsInput,
  isIncomplete,
  validateEmployeeTerms,
} from './employee-record';
import { InvalidEmployeeRecord } from './errors';

const valid: EmployeeTermsInput = {
  contractMinutes: 40 * 60,
  workingDays: [1, 2, 3, 4, 5],
  employmentStart: '2026-11-02',
  employmentEnd: null,
};

/** The `_tag`s of the rules `input` breaks, or `[]` when it is valid. */
const brokenRules = (input: EmployeeTermsInput): ReadonlyArray<string> => {
  const result = validateEmployeeTerms(input);
  if (Either.isRight(result)) return [];
  expect(result.left).toBeInstanceOf(InvalidEmployeeRecord);
  return result.left.violations.map((v) => v._tag);
};

describe('validateEmployeeTerms (AC-20)', () => {
  it.each<[string, Partial<EmployeeTermsInput>, ReadonlyArray<string>]>([
    ['zero contract hours', { contractMinutes: 0 }, ['ContractHoursOutOfRange']],
    ['negative contract hours', { contractMinutes: -8 * 60 }, ['ContractHoursOutOfRange']],
    ['61 contract hours', { contractMinutes: 61 * 60 }, ['ContractHoursOutOfRange']],
    ['a minute over 60 hours', { contractMinutes: 3601 }, ['ContractHoursOutOfRange']],
    ['a fraction of a minute', { contractMinutes: 2400.5 }, ['ContractHoursOutOfRange']],
    ['no working day', { workingDays: [] }, ['NoWorkingDay']],
    [
      'end before start',
      { employmentStart: '2026-11-02', employmentEnd: '2026-11-01' },
      ['EmploymentEndsBeforeStart'],
    ],
    [
      'every rule at once',
      { contractMinutes: 0, workingDays: [], employmentEnd: '2026-01-01' },
      ['ContractHoursOutOfRange', 'NoWorkingDay', 'EmploymentEndsBeforeStart'],
    ],
    ['one minute a week', { contractMinutes: 1 }, []],
    ['exactly 60 hours', { contractMinutes: 60 * 60 }, []],
    [
      '24 hours Monday to Wednesday (AC-19)',
      { contractMinutes: 24 * 60, workingDays: [1, 2, 3] },
      [],
    ],
    ['a single working day', { workingDays: [7] }, []],
    ['end on the start day', { employmentEnd: '2026-11-02' }, []],
    ['end after start', { employmentEnd: '2027-03-31' }, []],
    ['no contract hours yet (incomplete, not invalid)', { contractMinutes: null }, []],
    ['no start date yet, with an end', { employmentStart: null, employmentEnd: '2026-01-01' }, []],
  ])('%s', (_, change, rules) => {
    expect(brokenRules({ ...valid, ...change })).toEqual(rules);
  });

  it('defaults missing working days to Monday–Friday (AC-06)', () => {
    const { workingDays: _, ...withoutDays } = valid;
    expect(validateEmployeeTerms(withoutDays)).toEqual(
      Either.right({ ...withoutDays, workingDays: [1, 2, 3, 4, 5] }),
    );
  });

  it('returns working days sorted, each once', () => {
    const result = validateEmployeeTerms({ ...valid, workingDays: [5, 1, 3, 1] });
    expect(Either.map(result, (t) => t.workingDays)).toEqual(Either.right([1, 3, 5]));
  });
});

describe('isIncomplete (AC-06)', () => {
  it.each([
    [2400, '2026-11-02', false],
    [null, '2026-11-02', true],
    [2400, null, true],
    [null, null, true],
  ] as const)('contract %s, start %s → %s', (contractMinutes, employmentStart, expected) => {
    expect(isIncomplete({ contractMinutes, employmentStart })).toBe(expected);
  });
});

const record = (overrides: Partial<ConstructorParameters<typeof EmployeeRecord>[0]> = {}) =>
  new EmployeeRecord({
    id: EmployeeId.make('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'),
    fullName: 'Anna Smith',
    userId: null,
    teamId: null,
    contractMinutes: 2400,
    workingDays: [1, 2, 3, 4, 5],
    employmentStart: '2026-11-02',
    employmentEnd: null,
    version: 1,
    lastChangedBy: UserId.make('6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91'),
    lastChangedAt: new Date('2026-11-01T10:00:00Z'),
    createdAt: new Date('2026-11-01T10:00:00Z'),
    ...overrides,
  });

describe('EmployeeRecord', () => {
  it('is incomplete without contract hours or a start date, but not without a team (AC-06)', () => {
    expect(record().isIncomplete).toBe(false);
    expect(record({ contractMinutes: null }).isIncomplete).toBe(true);
    expect(record({ employmentStart: null }).isIncomplete).toBe(true);
    expect(record({ teamId: null }).isIncomplete).toBe(false);
  });

  it.each<[string, Partial<ConstructorParameters<typeof EmployeeRecord>[0]>]>([
    ['zero contract minutes', { contractMinutes: 0 }],
    ['over 60 hours', { contractMinutes: 3601 }],
    ['no working day', { workingDays: [] }],
    ['a repeated working day', { workingDays: [1, 1] }],
    ['a weekday outside 1–7', { workingDays: [8 as IsoWeekday] }],
    ['an impossible date', { employmentStart: '2026-02-30' }],
    ['version 0', { version: 0 }],
  ])('refuses to hold %s', (_, overrides) => {
    expect(() => record(overrides)).toThrow();
  });
});

describe('checkVersion', () => {
  it('passes the record at the expected version', () => {
    const current = record({ version: 3 });
    expect(checkVersion(current, 3)).toEqual(Either.right(current));
  });

  it('fails with the current record when it changed meanwhile', () => {
    const current = record({ version: 4 });
    const result = checkVersion(current, 3);
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(EmployeeRecordVersionConflict);
      expect(result.left.current).toBe(current);
    }
  });
});
