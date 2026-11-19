import { Actor, Unauthenticated } from '@arv/kernel';
import { MANAGE_EMPLOYEE_RECORDS } from '@arv/org';
import { MANAGE_PROJECTS } from '@arv/projects';
import { Effect, Either, Layer } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ImportFileInvalid,
  ImportPermissionsMissing,
  type ImportProblemRows,
} from '../domain/errors';
import { EDIT_ALLOCATIONS } from '../permissions';
import { planImport, previewImport } from './import-preview';
import { makeSchedulingFakes, type SchedulingFakes } from './testing';

const HEADER =
  'Employee,Team,Contract hours,Working days,Employment start,Employment end,Project,Project type,Start,End,Hours,Per';

const line = (...cells: string[]) => cells.join(',');
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');

let fakes: SchedulingFakes;
let importer: Actor;

const run = <A, E, R>(effect: Effect.Effect<A, E, R>, actor: Actor = importer) =>
  Effect.runPromise(
    Effect.either(
      effect.pipe(Effect.provide(Layer.merge(fakes.layer, fakes.as(actor)))) as Effect.Effect<
        A,
        E,
        never
      >,
    ),
  );

const left = <A, E>(result: Either.Either<A, E>): E => {
  if (Either.isRight(result))
    throw new Error(`expected a failure, got ${JSON.stringify(result.right)}`);
  return result.left;
};

const right = <A, E>(result: Either.Either<A, E>): A => {
  if (Either.isLeft(result))
    throw new Error(`expected success, got ${JSON.stringify(result.left)}`);
  return result.right;
};

beforeEach(() => {
  fakes = makeSchedulingFakes();
  importer = fakes.user([EDIT_ALLOCATIONS, MANAGE_EMPLOYEE_RECORDS, MANAGE_PROJECTS]);
});

const CLEAN = csv(
  line(
    'Ada Lovelace',
    'Platform',
    '40',
    'Mon-Fri',
    '2025-01-06',
    '',
    'Atlas',
    'client',
    '2026-11-02',
    '2026-11-27',
    '24',
    'week',
  ),
  line(
    'Ada Lovelace',
    'Platform',
    '40',
    'Mon-Fri',
    '2025-01-06',
    '',
    'Orion',
    '',
    '2026-11-02',
    '2026-11-27',
    '24',
    'week',
  ),
  line(
    'Grace Hopper',
    'Platform',
    '',
    '',
    '',
    '',
    'Atlas',
    '',
    '2026-11-02',
    '2026-11-27',
    '4',
    'day',
  ),
  line(
    'Alan Turing',
    '',
    '32',
    'Mon-Thu',
    '2024-03-01',
    '',
    'Annual leave',
    'leave',
    '2026-12-21',
    '2026-12-24',
    '',
    '',
  ),
);

describe('previewImport — permissions (AC-33)', () => {
  it('refuses naming every missing permission, before reading the file', async () => {
    const planner = fakes.user([EDIT_ALLOCATIONS]);
    expect(left(await run(previewImport('not even csv "'), planner))).toEqual(
      new ImportPermissionsMissing({
        missing: [MANAGE_EMPLOYEE_RECORDS, MANAGE_PROJECTS],
      }),
    );
  });

  it('names a single missing permission', async () => {
    const hr = fakes.user([MANAGE_EMPLOYEE_RECORDS, MANAGE_PROJECTS]);
    expect(left(await run(previewImport(CLEAN), hr))).toEqual(
      new ImportPermissionsMissing({ missing: [EDIT_ALLOCATIONS] }),
    );
  });

  it('refuses an anonymous caller as unauthenticated', async () => {
    expect(left(await run(previewImport(CLEAN), Actor.Anonymous()))).toBeInstanceOf(
      Unauthenticated,
    );
  });
});

describe('previewImport — a clean file (AC-30)', () => {
  it('counts records, projects and allocations, incomplete records and overbooked weeks', async () => {
    fakes.seedProject({ name: 'Orion', type: 'internal' });

    const preview = right(await run(previewImport(CLEAN)));

    expect(preview).toEqual({
      employeeRecordsToCreate: 3,
      // Orion is open already and reused (AC-24).
      projectsToCreate: 2,
      allocationsToCreate: 4,
      // Grace Hopper has no contract hours and no start (AC-06).
      incompleteRecords: 1,
      // Ada: 48 h a week on 40 → 8 h over in each of the 4 weeks.
      overbookedWeeks: ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'].map(
        (weekStart) => ({ fullName: 'Ada Lovelace', weekStart, overMinutes: 480 }),
      ),
    });
  });

  it('hands the commit checked inputs for the org and projects import commands', async () => {
    const planned = right(await run(planImport(CLEAN)));
    expect(
      planned.records.map((r) => [r.fullName, r.teamName, r.contractMinutes, r.workingDays]),
    ).toEqual([
      ['Ada Lovelace', 'Platform', 2400, [1, 2, 3, 4, 5]],
      ['Grace Hopper', 'Platform', null, [1, 2, 3, 4, 5]],
      ['Alan Turing', null, 1920, [1, 2, 3, 4]],
    ]);
    expect(planned.projects).toEqual([
      { name: 'Atlas', type: 'client' },
      { name: 'Orion', type: 'client' },
      { name: 'Annual leave', type: 'leave' },
    ]);
    expect(planned.allocations).toHaveLength(4);
  });

  it('subtracts public holidays from capacity', async () => {
    fakes.seedHoliday('2026-11-04');
    const preview = right(
      await run(
        previewImport(
          csv(
            line(
              'Ada Lovelace',
              '',
              '40',
              '',
              '2025-01-06',
              '',
              'Atlas',
              '',
              '2026-11-02',
              '2026-11-06',
              '8',
              'day',
            ),
          ),
        ),
      ),
    );
    // 4 working days × 8 h = 32 h on a 32 h week: fully booked, not over.
    expect(preview.overbookedWeeks).toEqual([]);
  });
});

describe('previewImport — problem rows (AC-31)', () => {
  it('checks each record against the employee-record rules (AC-20)', async () => {
    const problems = left(
      await run(
        previewImport(
          csv(
            line(
              'Ada Lovelace',
              '',
              '70',
              '',
              '2025-01-06',
              '',
              'Atlas',
              '',
              '2026-11-02',
              '2026-11-06',
              '8',
              '',
            ),
            line(
              'Grace Hopper',
              '',
              '40',
              '',
              '2026-01-01',
              '2025-12-31',
              'Atlas',
              '',
              '2026-11-02',
              '2026-11-06',
              '8',
              '',
            ),
          ),
        ),
      ),
    ) as ImportProblemRows;
    expect(problems._tag).toBe('ImportProblemRows');
    expect(problems.rows).toEqual([
      {
        row: 2,
        reason: 'invalid_employee_record',
        message:
          'Contract hours of «Ada Lovelace» must be above 0 and at most 60 a week, in whole minutes',
      },
      // Grace's allocation also falls after her (broken) employment end.
      expect.objectContaining({ row: 3, reason: 'end_before_start' }),
      expect.objectContaining({ row: 3, reason: 'outside_employment_period' }),
    ]);
    expect(problems.rows[1]?.message).toBe(
      'Employment end 2025-12-31 of «Grace Hopper» is before its start 2026-01-01',
    );
  });

  it('matches names against existing employee records and open projects', async () => {
    fakes.seedResource({ fullName: 'Ada Lovelace' });
    fakes.seedProject({ name: 'Atlas Web' });
    fakes.seedProject({ name: 'Old Atlas', closeDate: '2026-01-31' });

    const problems = left(
      await run(
        previewImport(
          csv(
            line(
              'A. Lovelace',
              '',
              '40',
              '',
              '2025-01-06',
              '',
              'atlas web',
              '',
              '2026-11-02',
              '2026-11-06',
              '8',
              '',
            ),
            // A closed project's name is free (AC-24): no look-alike there.
            line(
              'Grace Hopper',
              '',
              '40',
              '',
              '2025-01-06',
              '',
              'old atlas',
              '',
              '2026-11-02',
              '2026-11-06',
              '8',
              '',
            ),
          ),
        ),
      ),
    ) as ImportProblemRows;
    expect(problems.rows).toEqual([
      {
        row: 2,
        reason: 'similar_name',
        message: '«A. Lovelace» looks like the existing employee «Ada Lovelace»',
      },
      {
        row: 2,
        reason: 'similar_name',
        message: '«atlas web» looks like the existing project «Atlas Web»',
      },
    ]);
  });

  it('refuses a file it cannot read as the planning spreadsheet', async () => {
    expect(left(await run(previewImport('Name,Hours\nAda,8')))).toBeInstanceOf(ImportFileInvalid);
  });

  it('keeps formula-like cells as text: they reach the plan unchanged (PRD §6.1)', async () => {
    const planned = right(
      await run(
        planImport(
          csv(
            line(
              '=1+1',
              '',
              '40',
              '',
              '2025-01-06',
              '',
              '@SUM(A1)',
              '',
              '2026-11-02',
              '2026-11-06',
              '8',
              '',
            ),
          ),
        ),
      ),
    );
    expect(planned.records[0]?.fullName).toBe('=1+1');
    expect(planned.projects[0]?.name).toBe('@SUM(A1)');
  });
});

describe('previewImport — QS-8 smoke', () => {
  it('previews a 2,000-row file in well under 10 s', async () => {
    const rows: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const person = `Person ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) % 3} Resource`;
      const month = String(1 + (i % 12)).padStart(2, '0');
      rows.push(
        line(
          person,
          `Team ${(i % 26) % 5}`,
          '40',
          'Mon-Fri',
          '2024-01-01',
          '',
          `Project ${i % 150}x`,
          '',
          `2026-${month}-01`,
          `2026-${month}-25`,
          '2',
          'day',
        ),
      );
    }
    const started = performance.now();
    const preview = right(await run(previewImport(csv(...rows))));
    const elapsed = performance.now() - started;

    expect(preview.allocationsToCreate).toBe(2000);
    expect(preview.employeeRecordsToCreate).toBe(78);
    expect(elapsed).toBeLessThan(10_000);
  }, 20_000);
});
