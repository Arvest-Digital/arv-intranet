import { Either, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import { Segment } from './allocation';
import { ImportFileInvalid } from './errors';
import {
  checkImport,
  type ImportReference,
  importWindow,
  MAX_IMPORT_ROWS,
  readImportFile,
} from './import-rows';

const HEADER =
  'Employee,Team,Contract hours,Working days,Employment start,Employment end,Project,Project type,Start,End,Hours,Per';

/** A row in `HEADER` order; anything left out is empty. */
const row = (cells: {
  employee?: string;
  team?: string;
  contract?: string;
  days?: string;
  empStart?: string;
  empEnd?: string;
  project?: string;
  type?: string;
  start?: string;
  end?: string;
  hours?: string;
  per?: string;
}) =>
  [
    cells.employee ?? 'Ada Lovelace',
    cells.team ?? 'Platform',
    cells.contract ?? '40',
    cells.days ?? 'Mon-Fri',
    cells.empStart ?? '2025-01-06',
    cells.empEnd ?? '',
    cells.project ?? 'Atlas',
    cells.type ?? 'client',
    cells.start ?? '2026-11-02',
    cells.end ?? '2026-11-27',
    cells.hours ?? '20',
    cells.per ?? 'week',
  ].join(',');

const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');

const REFERENCE: ImportReference = {
  today: '2026-10-28',
  employeeNames: [],
  openProjects: [],
  holidays: new Set(),
};

const read = (text: string) => {
  const result = readImportFile(text);
  if (Either.isLeft(result)) throw new Error(result.left.message);
  return result.right;
};

const check = (text: string, reference: Partial<ImportReference> = {}) =>
  checkImport(read(text), { ...REFERENCE, ...reference });

const reasons = (text: string, reference: Partial<ImportReference> = {}) =>
  check(text, reference).problems.map((p) => [p.row, p.reason]);

describe('readImportFile', () => {
  it('fails ImportFileInvalid naming the missing required columns', () => {
    expect(readImportFile('Employee,Team\nAda,Platform')).toEqual(
      Either.left(
        new ImportFileInvalid({
          message: 'The header row lacks the columns «Project», «Start», «End», «Hours»',
        }),
      ),
    );
  });

  it('fails on an empty file, a header without rows and an open quote', () => {
    expect(Either.isLeft(readImportFile(''))).toBe(true);
    expect(Either.isLeft(readImportFile(`${HEADER}\n,,,\n`))).toBe(true);
    expect(Either.isLeft(readImportFile(`${HEADER}\n"Ada`))).toBe(true);
  });

  it(`refuses more than ${MAX_IMPORT_ROWS} rows`, () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => row({}));
    expect(Either.isLeft(readImportFile(csv(...rows)))).toBe(true);
  });

  it('matches headers ignoring case, extra spaces and order, and ignores unknown columns', () => {
    const parsed = read(
      'HOURS ,  project,notes,employee,end,start\n8,Atlas,whatever,Ada Lovelace,2026-11-06,2026-11-02',
    );
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({
      row: 2,
      employee: 'Ada Lovelace',
      project: 'Atlas',
      startsOn: '2026-11-02',
      endsOn: '2026-11-06',
      hoursMinutes: 480,
      per: 'week',
    });
  });

  it('skips empty rows but keeps the spreadsheet row numbers', () => {
    const parsed = read(csv(row({}), ',,,,,,,,,,,', row({})));
    expect(parsed.rows.map((r) => r.row)).toEqual([2, 4]);
  });

  it('keeps formula-like names as plain text (PRD §6.1)', () => {
    const parsed = read(csv(row({ employee: '=HYPERLINK("x")', project: '@Atlas' })));
    expect(parsed.rows[0]?.employee).toBe('=HYPERLINK("x")');
    expect(parsed.rows[0]?.project).toBe('@Atlas');
  });

  it('reads decimal hours with a dot or a comma, and working-day lists', () => {
    const parsed = read(
      csv(row({ hours: '"7,75"', per: 'day', contract: '37.5', days: '"Mon, Wed, Fri"' })),
    );
    expect(parsed.rows[0]?.hoursMinutes).toBe(465);
    expect(parsed.rows[0]?.per).toBe('day');
    expect(parsed.rows[0]?.employeeCells).toMatchObject({
      contractMinutes: 2250,
      workingDays: [1, 3, 5],
    });
  });

  it('reports unreadable cells with the column and value', () => {
    const parsed = read(
      csv(row({ start: '02/11/2026', hours: 'eight', days: 'Funday', type: 'gig', per: 'month' })),
    );
    expect(parsed.problems.map((p) => p.message)).toEqual([
      'Working days «Funday» are not weekdays such as «Mon-Fri»',
      'Project type «gig» is not one of client, internal, bench, training, leave',
      'Start «02/11/2026» is not a date between 2000 and 2099 (YYYY-MM-DD)',
      'Hours «eight» is not a number of hours',
      'Per «month» is not «day» or «week»',
    ]);
  });

  it('refuses dates that do not exist', () => {
    expect(read(csv(row({ end: '2026-02-30' }))).problems).toHaveLength(1);
  });
});

describe('checkImport — problem rows (AC-31)', () => {
  it('empty_hours: a work row without hours', () => {
    expect(reasons(csv(row({ hours: '' })))).toEqual([[2, 'empty_hours']]);
  });

  it('a leave row needs no hours: it books whole working days (AC-15)', () => {
    const result = check(csv(row({ project: 'Annual leave', type: 'leave', hours: '' })));
    expect(result.problems).toEqual([]);
    expect(result.plan.allocations[0]?.segment).toEqual(
      new Segment({
        startsOn: '2026-11-02',
        endsOn: '2026-11-27',
        rateMinutes: null,
        ratePeriod: 'full-day',
      }),
    );
  });

  it('end_before_start: an allocation ending before it starts', () => {
    expect(reasons(csv(row({ start: '2026-11-10', end: '2026-11-09' })))).toEqual([
      [2, 'end_before_start'],
    ]);
  });

  it('invalid_allocation: hours breaking the AC-09 rules, each reported', () => {
    expect(
      check(csv(row({ hours: '0' }), row({ hours: '7.1' }), row({ hours: '25', per: 'day' })))
        .problems,
    ).toEqual([
      { row: 2, reason: 'invalid_allocation', message: 'Hours must be above zero' },
      { row: 3, reason: 'invalid_allocation', message: 'Hours must be whole quarter hours' },
      { row: 4, reason: 'invalid_allocation', message: 'Hours are more than 24 a day' },
    ]);
  });

  it('invalid_allocation: more than 24 hours per working day in a week', () => {
    expect(reasons(csv(row({ days: 'Mon', hours: '25', per: 'week' })))).toEqual([
      [2, 'invalid_allocation'],
    ]);
  });

  it('allows allocations that started in the past: the import brings in the current plan', () => {
    expect(reasons(csv(row({ start: '2025-03-03', end: '2025-03-28' })))).toEqual([]);
  });

  it('outside_employment_period: dates past the employment end (AC-13)', () => {
    const result = check(csv(row({ empEnd: '2026-11-15', end: '2026-11-27' })));
    expect(result.problems).toEqual([
      {
        row: 2,
        reason: 'outside_employment_period',
        message:
          '2026-11-02…2026-11-27 falls outside the employment period of «Ada Lovelace» (2025-01-06 to 2026-11-15)',
      },
    ]);
  });

  it('outside_employment_period: the employment period comes from any of the employee rows', () => {
    // Row 2 leaves the start empty; row 3 gives it, and row 2's dates fall before it.
    expect(
      reasons(
        csv(
          row({ empStart: '', start: '2026-01-05', end: '2026-01-09' }),
          row({ empStart: '2026-06-01', start: '2026-06-01', end: '2026-06-05' }),
        ),
      ),
    ).toEqual([[2, 'outside_employment_period']]);
  });

  it('invalid_allocation: running past the close date of an open project it reuses (AC-25)', () => {
    expect(
      reasons(csv(row({ project: 'atlas' })), {
        openProjects: [{ name: 'Atlas', type: 'client', closeDate: '2026-11-20' }],
      }),
    ).toEqual([
      [2, 'invalid_allocation'],
      [2, 'similar_name'],
    ]);
  });

  it('invalid_employee_record: an employee column contradicting an earlier row', () => {
    const result = check(csv(row({ contract: '40' }), row({ contract: '32' })));
    expect(result.problems).toEqual([
      {
        row: 3,
        reason: 'invalid_employee_record',
        message: 'Contract hours of «Ada Lovelace» differs from row 2',
      },
    ]);
  });

  it('invalid_allocation: one project given two types, or a type unlike the existing project', () => {
    expect(reasons(csv(row({ type: 'client' }), row({ type: 'internal' })))).toEqual([
      [3, 'invalid_allocation'],
    ]);
    expect(
      reasons(csv(row({ type: 'leave', hours: '' })), {
        openProjects: [{ name: 'Atlas', type: 'client', closeDate: null }],
      }),
    ).toEqual([
      [2, 'empty_hours'],
      [2, 'invalid_allocation'],
    ]);
  });

  it('similar_name: employee spellings differing in initials, case or spaces', () => {
    const result = check(
      csv(
        row({ employee: 'Test User 1' }),
        row({ employee: 'T. User 1' }),
        row({ employee: 'test user 1' }),
        row({ employee: 'Test User 1' }),
      ),
    );
    expect(result.problems).toEqual([
      {
        row: 3,
        reason: 'similar_name',
        message: '«T. User 1» and «Test User 1» (row 2) look like the same person',
      },
      {
        row: 4,
        reason: 'similar_name',
        message: '«test user 1» and «Test User 1» (row 2) look like the same person',
      },
      {
        row: 4,
        reason: 'similar_name',
        message: '«test user 1» and «T. User 1» (row 3) look like the same person',
      },
    ]);
  });

  it('similar_name: project spellings, and names like existing records and projects', () => {
    expect(
      reasons(
        csv(
          row({ project: 'Atlas Web' }),
          row({ project: 'AtlasWeb' }),
          row({ employee: 'A. Byron', project: 'Orion' }),
        ),
        {
          employeeNames: ['Ada Byron'],
          openProjects: [{ name: 'orion', type: 'client', closeDate: null }],
        },
      ),
    ).toEqual([
      [3, 'similar_name'],
      [4, 'similar_name'],
      [4, 'similar_name'],
    ]);
  });

  it('similar_name: an employee who already has a record (the import only creates records)', () => {
    expect(check(csv(row({})), { employeeNames: ['Ada Lovelace'] }).problems).toEqual([
      {
        row: 2,
        reason: 'similar_name',
        message: '«Ada Lovelace» already has an employee record; the import only creates new ones',
      },
    ]);
  });

  it('reports every problem of every row, in row order, and no overbooking', () => {
    const result = check(
      csv(
        row({ hours: '', start: '2026-11-10', end: '2026-11-09' }),
        row({ employee: 'B. Lovelace', hours: '60' }),
      ),
    );
    expect(result.problems.map((p) => [p.row, p.reason])).toEqual([
      [2, 'empty_hours'],
      [2, 'end_before_start'],
    ]);
    expect(result.overbookedWeeks).toEqual([]);
  });
});

describe('checkImport — a clean file (AC-30)', () => {
  const clean = csv(
    row({ employee: 'Ada Lovelace', project: 'Atlas', hours: '24' }),
    row({ employee: 'Ada Lovelace', project: 'Orion', type: '', hours: '24' }),
    row({ employee: 'Grace Hopper', contract: '', project: 'Atlas', hours: '20' }),
    row({ employee: 'Alan Turing', project: 'Annual leave', type: 'leave', hours: '' }),
  );

  it('plans one record per employee, one project per name and one allocation per row', () => {
    const { problems, plan } = check(clean, {
      openProjects: [{ name: 'Orion', type: 'internal', closeDate: null }],
    });
    expect(problems).toEqual([]);
    expect(plan.resources.map((r) => [r.fullName, r.contractMinutes, r.firstRow])).toEqual([
      ['Ada Lovelace', 2400, 2],
      ['Grace Hopper', null, 4],
      ['Alan Turing', 2400, 5],
    ]);
    expect(plan.projects.map((p) => [p.name, p.type, p.created])).toEqual([
      ['Atlas', 'client', true],
      ['Orion', 'internal', false],
      ['Annual leave', 'leave', true],
    ]);
    expect(plan.allocations.map((a) => [a.row, a.employee, a.projectKey])).toEqual([
      [2, 'Ada Lovelace', 'atlas'],
      [3, 'Ada Lovelace', 'orion'],
      [4, 'Grace Hopper', 'atlas'],
      [5, 'Alan Turing', 'annual leave'],
    ]);
  });

  it('lists the overbooked resource-weeks by name and week, in exact minutes', () => {
    // Ada: 48 h a week on a 40 h contract → 8 h over in each of the 4 weeks.
    const { overbookedWeeks } = check(clean);
    expect(overbookedWeeks).toEqual(
      ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'].map((weekStart) => ({
        fullName: 'Ada Lovelace',
        weekStart,
        overMinutes: 8 * 60,
      })),
    );
  });

  it('counts public holidays against capacity', () => {
    const { overbookedWeeks } = check(
      csv(row({ hours: '48', start: '2026-11-02', end: '2026-11-06' })),
      {
        holidays: new Set(['2026-11-04']),
      },
    );
    // Capacity 32 h that week; 48 h a week is 9.6 h per working day, none on the holiday → 38.4 h.
    expect(overbookedWeeks).toEqual([
      { fullName: 'Ada Lovelace', weekStart: '2026-11-02', overMinutes: 6.4 * 60 },
    ]);
  });

  it('the first explicit project type wins over earlier empty ones', () => {
    const { problems, plan } = check(
      csv(row({ type: '' }), row({ type: 'internal', start: '2026-12-01', end: '2026-12-04' })),
    );
    expect(problems).toEqual([]);
    expect(plan.projects.map((p) => p.type)).toEqual(['internal']);
  });
});

describe('importWindow', () => {
  it('spans the rows from the Monday of the first date to the Sunday of the last', () => {
    expect(
      importWindow(read(csv(row({ start: '2026-11-04', end: '2026-11-05' }), row({}))).rows),
    ).toEqual(Option.some({ from: '2026-11-02', to: '2026-11-29' }));
  });
});
