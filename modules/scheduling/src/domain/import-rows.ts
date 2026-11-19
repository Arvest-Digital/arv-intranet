import { Either, Option } from 'effect';
import {
  type BookingContext,
  type IsoDate,
  periodRules,
  type Rate,
  rateRules,
  Segment,
} from './allocation';
import { addDays, type EmploymentTerms, type Holidays, isoWeekStart } from './capacity';
import { parseCsv } from './csv';
import { ImportFileInvalid, type ImportProblemReason, type ImportProblemRow } from './errors';
import { overbookedWeeks } from './overbooking';
import { looksLikeSameName, spelling } from './similar-name';
import { TICKS_PER_MINUTE } from './ticks';
import { weeklyFigures } from './weekly-figures';

/**
 * Reading and checking the planning spreadsheet (flow 13, AC-30, AC-31).
 *
 * ASSUMED FORMAT — the PM's sample is still owed (PRD §8, sync report D-6). Until it arrives the
 * import reads a CSV export with a header row and **one row per allocation**; the employee's and
 * the project's details repeat on each of their rows. Header names are matched ignoring case and
 * extra spaces, columns may come in any order, and unknown columns are ignored. When the real
 * format is known, only `COLUMNS` and the cell readers below should need to change.
 *
 * | Column           | Required | Cell                                                            |
 * |------------------|----------|-----------------------------------------------------------------|
 * | Employee         | yes      | full name                                                       |
 * | Team             |          | team name                                                       |
 * | Contract hours   |          | hours per week, e.g. `40` or `37.5`; empty = incomplete (AC-06) |
 * | Working days     |          | e.g. `Mon-Fri`, `Mon, Tue, Thu`, `1-5`; empty = Monday–Friday   |
 * | Employment start |          | `YYYY-MM-DD`; empty = incomplete record (AC-06)                 |
 * | Employment end   |          | `YYYY-MM-DD`                                                    |
 * | Project          | yes      | project name                                                    |
 * | Project type     |          | client, internal, bench, training or leave; empty = client      |
 * | Start            | yes      | `YYYY-MM-DD`                                                    |
 * | End              | yes      | `YYYY-MM-DD`                                                    |
 * | Hours            | yes¹     | hours per day or week, quarter hours, e.g. `8` or `7.75`        |
 * | Per              |          | `day` or `week`; empty = week                                   |
 *
 * ¹ Leave rows (a project of type leave) take whole working days (AC-15), so their hours are not
 *   read.
 *
 * Within one employee's rows (same spelling) the first non-empty value of each employee column
 * wins; a different non-empty value on a later row is a problem. The same holds for a project's type.
 */

// ─── Columns ─────────────────────────────────────────────────────────────────────────────────

const COLUMNS = {
  employee: { header: 'Employee', aliases: ['employee', 'full name', 'name'], required: true },
  team: { header: 'Team', aliases: ['team'], required: false },
  contractHours: { header: 'Contract hours', aliases: ['contract hours'], required: false },
  workingDays: { header: 'Working days', aliases: ['working days'], required: false },
  employmentStart: { header: 'Employment start', aliases: ['employment start'], required: false },
  employmentEnd: { header: 'Employment end', aliases: ['employment end'], required: false },
  project: { header: 'Project', aliases: ['project'], required: true },
  projectType: { header: 'Project type', aliases: ['project type', 'type'], required: false },
  startsOn: { header: 'Start', aliases: ['start', 'start date', 'from'], required: true },
  endsOn: { header: 'End', aliases: ['end', 'end date', 'to'], required: true },
  hours: { header: 'Hours', aliases: ['hours'], required: true },
  per: { header: 'Per', aliases: ['per', 'period'], required: false },
} as const;

type Column = keyof typeof COLUMNS;

/** A preview of up to 2,000 rows must stay under 10 s (QS-8); far larger files are refused. */
export const MAX_IMPORT_ROWS = 5000;

/** Dates outside this range are typos, and would make the weekly figures needlessly long. */
const EARLIEST_DATE = '2000-01-01';
const LATEST_DATE = '2099-12-31';

/** The project types of the `projects` module (repeated: the domain cannot import it). */
export const IMPORT_PROJECT_TYPES = ['client', 'internal', 'bench', 'training', 'leave'] as const;
export type ImportProjectType = (typeof IMPORT_PROJECT_TYPES)[number];

const normaliseHeader = (header: string): string =>
  header.trim().toLowerCase().replace(/\s+/g, ' ');

// ─── Cell readers ────────────────────────────────────────────────────────────────────────────

type Cell<A> = Either.Either<A, string>;

/** A real calendar date `YYYY-MM-DD` in the sensible range; the message names the column. */
const readDate = (cell: string, header: string): Cell<IsoDate> => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cell);
  if (match !== null) {
    const [, y, m, d] = match.map(Number) as [number, number, number, number];
    const date = new Date(Date.UTC(y, m - 1, d));
    const real =
      date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
    if (real && cell >= EARLIEST_DATE && cell <= LATEST_DATE) return Either.right(cell);
  }
  return Either.left(`${header} «${cell}» is not a date between 2000 and 2099 (YYYY-MM-DD)`);
};

/** Hours (`7.5` or `7,5`) as whole minutes when they are; fractions of a minute stay fractional. */
const readHoursAsMinutes = (cell: string, header: string): Cell<number> => {
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(cell)) {
    return Either.left(`${header} «${cell}» is not a number of hours`);
  }
  const minutes = Number(cell.replace(',', '.')) * 60;
  // `7.1 * 60` is 425.99999999999994: snap float noise, keep a real fraction of a minute.
  const snapped = Math.round(minutes * 1e6) / 1e6;
  return Either.right(snapped);
};

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const weekdayOf = (token: string): number | null => {
  if (/^[1-7]$/.test(token)) return Number(token);
  const index = WEEKDAYS.indexOf(token.slice(0, 3).toLowerCase() as (typeof WEEKDAYS)[number]);
  return token.length >= 2 && index >= 0 ? index + 1 : null;
};

/** `Mon-Fri`, `Mon, Wed`, `1-5`: ISO weekdays 1–7, sorted, without repeats. */
const readWorkingDays = (cell: string, header: string): Cell<ReadonlyArray<number>> => {
  const days = new Set<number>();
  for (const part of cell.split(/[,;/\s]+/).filter((p) => p !== '')) {
    const [from, to, ...rest] = part.split(/[-–]/);
    const first = from === undefined ? null : weekdayOf(from);
    const last = to === undefined ? first : weekdayOf(to);
    if (first === null || last === null || rest.length > 0 || last < first) {
      return Either.left(`${header} «${cell}» are not weekdays such as «Mon-Fri»`);
    }
    for (let day = first; day <= last; day++) days.add(day);
  }
  return Either.right([...days].sort((a, b) => a - b));
};

const readProjectType = (cell: string, header: string): Cell<ImportProjectType> => {
  const type = cell.toLowerCase();
  return (IMPORT_PROJECT_TYPES as ReadonlyArray<string>).includes(type)
    ? Either.right(type as ImportProjectType)
    : Either.left(`${header} «${cell}» is not one of ${IMPORT_PROJECT_TYPES.join(', ')}`);
};

const readPer = (cell: string, header: string): Cell<'day' | 'week'> => {
  const per = cell.toLowerCase();
  if (per === 'day' || per === 'week') return Either.right(per);
  return Either.left(`${header} «${cell}» is not «day» or «week»`);
};

// ─── Reading the file ────────────────────────────────────────────────────────────────────────

/** An employee's columns on one row; `undefined` = empty cell, absent on unreadable cells too. */
export interface EmployeeCells {
  readonly team?: string;
  readonly contractMinutes?: number;
  readonly workingDays?: ReadonlyArray<number>;
  readonly employmentStart?: IsoDate;
  readonly employmentEnd?: IsoDate;
}

/**
 * One spreadsheet row, read. Every cell is kept as text until read; a cell that cannot be read is
 * reported as a problem and left `null` here, so the later checks skip it.
 */
export interface ImportRow {
  readonly row: number;
  /** The full name as spelled (surrounding spaces dropped). */
  readonly employee: string;
  readonly employeeCells: EmployeeCells;
  /** The project name as spelled (surrounding spaces dropped). */
  readonly project: string;
  readonly projectType: ImportProjectType | null;
  readonly startsOn: IsoDate | null;
  readonly endsOn: IsoDate | null;
  /** Minutes per `per`; `null` when the cell is empty or unreadable. */
  readonly hoursMinutes: number | null;
  /** The hours cell was empty (AC-31 `empty_hours`), as opposed to unreadable. */
  readonly hoursEmpty: boolean;
  readonly per: 'day' | 'week';
}

export interface ReadImport {
  readonly rows: ReadonlyArray<ImportRow>;
  /** Cells that could not be read, and rows missing an employee or project name. */
  readonly problems: ReadonlyArray<ImportProblemRow>;
}

const problem = (row: number, reason: ImportProblemReason, message: string): ImportProblemRow => ({
  row,
  reason,
  message,
});

/**
 * Reads the CSV text into rows (see the format at the top). Fails `ImportFileInvalid` when there
 * is nothing row-level to report: a quote left open, a required column missing, no rows, or more
 * than `MAX_IMPORT_ROWS`. Fully empty rows are skipped but keep their row numbers.
 */
export const readImportFile = (text: string): Either.Either<ReadImport, ImportFileInvalid> =>
  Either.gen(function* () {
    const records = yield* Either.mapLeft(
      parseCsv(text),
      ({ row }) =>
        new ImportFileInvalid({ message: `Row ${row} opens a quoted cell that is never closed` }),
    );
    const [header, ...body] = records;
    if (header === undefined) {
      return yield* Either.left(new ImportFileInvalid({ message: 'The file is empty' }));
    }

    const index = new Map<Column, number>();
    header.cells.forEach((cell, position) => {
      const name = normaliseHeader(cell);
      for (const [column, spec] of Object.entries(COLUMNS) as Array<
        [Column, (typeof COLUMNS)[Column]]
      >) {
        if (!index.has(column) && (spec.aliases as ReadonlyArray<string>).includes(name)) {
          index.set(column, position);
          return;
        }
      }
    });
    const missing = (Object.entries(COLUMNS) as Array<[Column, (typeof COLUMNS)[Column]]>)
      .filter(([column, spec]) => spec.required && !index.has(column))
      .map(([, spec]) => `«${spec.header}»`);
    if (missing.length > 0) {
      return yield* Either.left(
        new ImportFileInvalid({
          message: `The header row lacks the columns ${missing.join(', ')}`,
        }),
      );
    }

    const filled = body.filter((record) => record.cells.some((cell) => cell.trim() !== ''));
    if (filled.length === 0) {
      return yield* Either.left(
        new ImportFileInvalid({ message: 'The file has no rows to import' }),
      );
    }
    if (filled.length > MAX_IMPORT_ROWS) {
      return yield* Either.left(
        new ImportFileInvalid({
          message: `The file has ${filled.length} rows; at most ${MAX_IMPORT_ROWS} can be imported`,
        }),
      );
    }

    const rows: ImportRow[] = [];
    const problems: ImportProblemRow[] = [];
    for (const { row, cells } of filled) {
      const cell = (column: Column): string => {
        const position = index.get(column);
        return position === undefined ? '' : (cells[position] ?? '').trim();
      };
      /** Reads a non-empty cell; an unreadable one becomes a problem with `reason`. */
      const read = <A>(
        column: Column,
        reader: (cell: string, header: string) => Cell<A>,
        reason: ImportProblemReason,
      ): A | undefined => {
        const raw = cell(column);
        if (raw === '') return undefined;
        const result = reader(raw, COLUMNS[column].header);
        if (Either.isLeft(result)) {
          problems.push(problem(row, reason, result.left));
          return undefined;
        }
        return result.right;
      };

      const employee = spelling(cell('employee'));
      const project = spelling(cell('project'));
      if (employee === '')
        problems.push(problem(row, 'invalid_employee_record', 'Employee is empty'));
      if (project === '') problems.push(problem(row, 'invalid_allocation', 'Project is empty'));

      const employeeCells: {
        -readonly [K in keyof EmployeeCells]: EmployeeCells[K];
      } = {};
      const team = spelling(cell('team'));
      if (team !== '') employeeCells.team = team;
      const contractMinutes = read('contractHours', readHoursAsMinutes, 'invalid_employee_record');
      if (contractMinutes !== undefined) employeeCells.contractMinutes = contractMinutes;
      const workingDays = read('workingDays', readWorkingDays, 'invalid_employee_record');
      if (workingDays !== undefined) employeeCells.workingDays = workingDays;
      const employmentStart = read('employmentStart', readDate, 'invalid_employee_record');
      if (employmentStart !== undefined) employeeCells.employmentStart = employmentStart;
      const employmentEnd = read('employmentEnd', readDate, 'invalid_employee_record');
      if (employmentEnd !== undefined) employeeCells.employmentEnd = employmentEnd;

      const projectType = read('projectType', readProjectType, 'invalid_allocation') ?? null;
      const startsOn = read('startsOn', readDate, 'invalid_allocation') ?? null;
      const endsOn = read('endsOn', readDate, 'invalid_allocation') ?? null;
      if (cell('startsOn') === '')
        problems.push(problem(row, 'invalid_allocation', 'Start is empty'));
      if (cell('endsOn') === '') problems.push(problem(row, 'invalid_allocation', 'End is empty'));
      const hoursEmpty = cell('hours') === '';
      const hoursMinutes = read('hours', readHoursAsMinutes, 'invalid_allocation') ?? null;
      const per = read('per', readPer, 'invalid_allocation') ?? 'week';

      if (employee === '' || project === '') continue;
      rows.push({
        row,
        employee,
        employeeCells,
        project,
        projectType,
        startsOn,
        endsOn,
        hoursMinutes,
        hoursEmpty,
        per,
      });
    }
    return { rows, problems };
  });

// ─── Checking the rows ───────────────────────────────────────────────────────────────────────

/** An existing project the import may reuse: one open today, matched by name key (AC-24). */
export interface OpenProject {
  readonly name: string;
  readonly type: ImportProjectType;
  readonly closeDate: IsoDate | null;
}

/** What the rows are checked against, read by the application from `org`, `projects` and `Today`. */
export interface ImportReference {
  readonly today: IsoDate;
  /** Full names of every existing employee record. */
  readonly employeeNames: ReadonlyArray<string>;
  /** Projects open today. */
  readonly openProjects: ReadonlyArray<OpenProject>;
  /** Public holidays over the weeks the rows touch. */
  readonly holidays: Holidays;
}

/** An employee record the import creates; terms not yet checked against AC-20 (org's rules). */
export interface ImportResource {
  readonly fullName: string;
  /** The first row naming this spelling: where its record-level problems are reported. */
  readonly firstRow: number;
  readonly teamName: string | null;
  readonly contractMinutes: number | null;
  /** `null` = left out, Monday–Friday (AC-06). */
  readonly workingDays: ReadonlyArray<number> | null;
  readonly employmentStart: IsoDate | null;
  readonly employmentEnd: IsoDate | null;
}

/** A project the import names: created, or an open one reused as it is (AC-24). */
export interface ImportProject {
  readonly name: string;
  readonly type: ImportProjectType;
  readonly created: boolean;
  /** The first row naming it: where a problem with the project itself is reported. */
  readonly firstRow: number;
  readonly closeDate: IsoDate | null;
}

/** An allocation the import creates, from one row. */
export interface ImportAllocation {
  readonly row: number;
  /** The `ImportResource.fullName` it books. */
  readonly employee: string;
  /** The key of the `ImportProject` it books against (see `projectKey`). */
  readonly projectKey: string;
  readonly segment: Segment;
}

/** A resource-week the import would overbook (contract `ImportResourceWeekOver`). */
export interface ImportWeekOver {
  readonly fullName: string;
  readonly weekStart: IsoDate;
  /** Exact, possibly fractional (ADR-0009). */
  readonly overMinutes: number;
}

/** What the import would create, once every row is clean. */
export interface ImportPlan {
  /** In order of first mention. */
  readonly resources: ReadonlyArray<ImportResource>;
  /** One per project name key, in order of first mention. */
  readonly projects: ReadonlyArray<ImportProject>;
  /** One per row, in row order. */
  readonly allocations: ReadonlyArray<ImportAllocation>;
}

export interface ImportCheck {
  /** Every problem found, in row order; the import may go ahead only when this is empty. */
  readonly problems: ReadonlyArray<ImportProblemRow>;
  readonly plan: ImportPlan;
  /** Computed only on clean rows; empty while there are problems. */
  readonly overbookedWeeks: ReadonlyArray<ImportWeekOver>;
}

/** What project names are matched on: `lower(trim(name))`, as in `projects` (AC-24). */
export const projectKey = (name: string): string => name.trim().toLowerCase();

const EMPLOYEE_FIELDS: ReadonlyArray<{
  readonly field: keyof EmployeeCells;
  readonly label: string;
}> = [
  { field: 'team', label: 'Team' },
  { field: 'contractMinutes', label: 'Contract hours' },
  { field: 'workingDays', label: 'Working days' },
  { field: 'employmentStart', label: 'Employment start' },
  { field: 'employmentEnd', label: 'Employment end' },
];

const sameValue = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((value, i) => value === b[i])
    : a === b;

/** One record per employee spelling; a later row contradicting an earlier one is a problem. */
const collectResources = (rows: ReadonlyArray<ImportRow>, problems: ImportProblemRow[]) => {
  const resources = new Map<
    string,
    { firstRow: number; cells: EmployeeCells; from: Map<string, number> }
  >();
  for (const row of rows) {
    const known = resources.get(row.employee);
    if (known === undefined) {
      const from = new Map<string, number>();
      for (const { field } of EMPLOYEE_FIELDS) {
        if (row.employeeCells[field] !== undefined) from.set(field, row.row);
      }
      resources.set(row.employee, { firstRow: row.row, cells: { ...row.employeeCells }, from });
      continue;
    }
    for (const { field, label } of EMPLOYEE_FIELDS) {
      const value = row.employeeCells[field];
      if (value === undefined) continue;
      const current = known.cells[field];
      if (current === undefined) {
        known.cells = { ...known.cells, [field]: value };
        known.from.set(field, row.row);
      } else if (!sameValue(current, value)) {
        problems.push(
          problem(
            row.row,
            'invalid_employee_record',
            `${label} of «${row.employee}» differs from row ${known.from.get(field)}`,
          ),
        );
      }
    }
  }
  return [...resources].map(
    ([fullName, { firstRow, cells }]): ImportResource => ({
      fullName,
      firstRow,
      teamName: cells.team ?? null,
      contractMinutes: cells.contractMinutes ?? null,
      workingDays: cells.workingDays ?? null,
      employmentStart: cells.employmentStart ?? null,
      employmentEnd: cells.employmentEnd ?? null,
    }),
  );
};

/**
 * One project per name key: an open project with that key is reused as it is (AC-24), otherwise one
 * is created with the first type given (client when none). A type contradicting the earlier one, or
 * the reused project's, is a problem: leave and work must never be mixed up (AC-15).
 */
const collectProjects = (
  rows: ReadonlyArray<ImportRow>,
  openProjects: ReadonlyArray<OpenProject>,
  problems: ImportProblemRow[],
) => {
  const open = new Map(openProjects.map((p) => [projectKey(p.name), p]));
  const projects = new Map<string, ImportProject & { typeRow: number | null }>();
  for (const row of rows) {
    const key = projectKey(row.project);
    const known = projects.get(key);
    if (known === undefined) {
      const existing = open.get(key);
      projects.set(
        key,
        existing !== undefined
          ? {
              name: existing.name,
              type: existing.type,
              created: false,
              firstRow: row.row,
              closeDate: existing.closeDate,
              typeRow: null,
            }
          : {
              name: row.project,
              type: row.projectType ?? 'client',
              created: true,
              firstRow: row.row,
              closeDate: null,
              typeRow: row.projectType === null ? null : row.row,
            },
      );
      if (existing !== undefined && row.projectType !== null && row.projectType !== existing.type) {
        problems.push(
          problem(
            row.row,
            'invalid_allocation',
            `«${existing.name}» already exists with project type ${existing.type}, not ${row.projectType}`,
          ),
        );
      }
      continue;
    }
    if (row.projectType === null || row.projectType === known.type) {
      if (known.created && known.typeRow === null && row.projectType !== null)
        known.typeRow = row.row;
      continue;
    }
    if (known.created && known.typeRow === null) {
      // Earlier rows left the type empty (client by default); the first explicit type wins.
      projects.set(key, { ...known, type: row.projectType, typeRow: row.row });
      continue;
    }
    problems.push(
      problem(
        row.row,
        'invalid_allocation',
        known.created
          ? `Project type of «${row.project}» differs from row ${known.typeRow}`
          : `«${known.name}» already exists with project type ${known.type}, not ${row.projectType}`,
      ),
    );
  }
  return projects;
};

const RULE_MESSAGES: Record<string, string> = {
  hours_not_positive: 'Hours must be above zero',
  hours_not_quarter_hour: 'Hours must be whole quarter hours',
  hours_over_24_per_day: 'Hours are more than 24 a day',
  hours_over_24_per_working_day: 'Hours are more than 24 per working day in a week',
};

/** AC-09, AC-13, AC-25 on one row, as manual entry checks them; the past may be imported. */
const allocationProblems = (
  row: ImportRow,
  resource: ImportResource,
  project: ImportProject,
): { problems: ImportProblemRow[]; segment: Segment | null } => {
  const problems: ImportProblemRow[] = [];
  const isLeave = project.type === 'leave';
  if (!isLeave && row.hoursEmpty) problems.push(problem(row.row, 'empty_hours', 'Hours are empty'));
  if (row.startsOn === null || row.endsOn === null) return { problems, segment: null };

  const ctx: BookingContext = {
    today: row.startsOn,
    employment: { startsOn: resource.employmentStart, endsOn: resource.employmentEnd },
    workingDaysPerWeek: new Set(resource.workingDays ?? [1, 2, 3, 4, 5]).size || 1,
    projectCloseDate: project.closeDate,
  };
  const period = periodRules(row.startsOn, row.endsOn, ctx);
  for (const rule of period.rules) {
    if (rule === 'end_before_start') {
      problems.push(
        problem(row.row, 'end_before_start', `End ${row.endsOn} is before start ${row.startsOn}`),
      );
    } else if (rule === 'outside_employment_period') {
      problems.push(
        problem(
          row.row,
          'outside_employment_period',
          `${row.startsOn}…${row.endsOn} falls outside the employment period of «${resource.fullName}» (${resource.employmentStart ?? '…'} to ${resource.employmentEnd ?? '…'})`,
        ),
      );
    } else if (rule === 'past_project_close_date') {
      problems.push(
        problem(
          row.row,
          'invalid_allocation',
          `«${project.name}» closes on ${project.closeDate}; the allocation runs past it`,
        ),
      );
    }
  }

  let rate: Rate | null = null;
  if (isLeave) rate = { ratePeriod: 'full-day', rateMinutes: null };
  else if (row.hoursMinutes !== null) {
    rate = { ratePeriod: row.per, rateMinutes: row.hoursMinutes };
    for (const rule of rateRules(rate, ctx.workingDaysPerWeek)) {
      problems.push(problem(row.row, 'invalid_allocation', RULE_MESSAGES[rule] ?? rule));
    }
  }
  const segment =
    problems.length === 0 && rate !== null
      ? new Segment({
          startsOn: row.startsOn,
          endsOn: row.endsOn,
          rateMinutes: rate.rateMinutes,
          ratePeriod: rate.ratePeriod,
        })
      : null;
  return { problems, segment };
};

/**
 * AC-31: names that look like different spellings of one person or project, among the rows and
 * against existing records and open projects. Each spelling is reported once per look-alike, on the
 * first row it appears. A spelling equal to an existing employee record's name is reported too:
 * the import only creates records, so it would make a second one.
 */
const similarNameProblems = (
  rows: ReadonlyArray<ImportRow>,
  reference: ImportReference,
): ImportProblemRow[] => {
  const problems: ImportProblemRow[] = [];
  const firstRows = (pick: (row: ImportRow) => string) => {
    const first = new Map<string, number>();
    for (const row of rows) if (!first.has(pick(row))) first.set(pick(row), row.row);
    return [...first];
  };

  const people = firstRows((row) => row.employee);
  for (const [i, [name, row]] of people.entries()) {
    for (const [earlier, earlierRow] of people.slice(0, i)) {
      if (looksLikeSameName(name, earlier)) {
        problems.push(
          problem(
            row,
            'similar_name',
            `«${name}» and «${earlier}» (row ${earlierRow}) look like the same person`,
          ),
        );
      }
    }
    for (const existing of reference.employeeNames) {
      if (spelling(existing) === name) {
        problems.push(
          problem(
            row,
            'similar_name',
            `«${name}» already has an employee record; the import only creates new ones`,
          ),
        );
      } else if (looksLikeSameName(name, existing)) {
        problems.push(
          problem(row, 'similar_name', `«${name}» looks like the existing employee «${existing}»`),
        );
      }
    }
  }

  const projects = firstRows((row) => row.project);
  for (const [i, [name, row]] of projects.entries()) {
    for (const [earlier, earlierRow] of projects.slice(0, i)) {
      if (looksLikeSameName(name, earlier)) {
        problems.push(
          problem(
            row,
            'similar_name',
            `«${name}» and «${earlier}» (row ${earlierRow}) look like the same project`,
          ),
        );
      }
    }
    for (const existing of reference.openProjects) {
      if (looksLikeSameName(name, existing.name)) {
        problems.push(
          problem(
            row,
            'similar_name',
            `«${name}» looks like the existing project «${existing.name}»`,
          ),
        );
      }
    }
  }
  return problems;
};

/** The weeks each imported resource would be overbooked in (AC-30: shown, not refused). */
const importOverbooking = (
  resources: ReadonlyArray<ImportResource>,
  allocations: ReadonlyArray<ImportAllocation>,
  holidays: Holidays,
): ImportWeekOver[] => {
  const over: ImportWeekOver[] = [];
  for (const resource of resources) {
    const segments = allocations
      .filter((a) => a.employee === resource.fullName)
      .map((a) => a.segment);
    if (segments.length === 0) continue;
    const terms: EmploymentTerms = {
      contractMinutes: resource.contractMinutes,
      workingDays: resource.workingDays ?? [1, 2, 3, 4, 5],
      employmentStart: resource.employmentStart,
      employmentEnd: resource.employmentEnd,
    };
    const from = isoWeekStart(segments.map((s) => s.startsOn).sort()[0] as IsoDate);
    const to = addDays(
      isoWeekStart(
        segments
          .map((s) => s.endsOn)
          .sort()
          .at(-1) as IsoDate,
      ),
      6,
    );
    const weeks = weeklyFigures(
      { terms, allocations: segments.map((s) => ({ segments: [s] })) },
      holidays,
      from,
      to,
    );
    for (const week of overbookedWeeks(weeks)) {
      over.push({
        fullName: resource.fullName,
        weekStart: week.weekStart,
        overMinutes: week.over / TICKS_PER_MINUTE,
      });
    }
  }
  return over.sort(
    (a, b) => a.fullName.localeCompare(b.fullName) || a.weekStart.localeCompare(b.weekStart),
  );
};

const REASON_ORDER: ReadonlyArray<ImportProblemReason> = [
  'empty_hours',
  'end_before_start',
  'outside_employment_period',
  'invalid_allocation',
  'invalid_employee_record',
  'similar_name',
];

/** Row order, then a stable reason order, so the list reads top to bottom. */
export const sortProblems = (problems: ReadonlyArray<ImportProblemRow>): ImportProblemRow[] =>
  [...problems].sort(
    (a, b) => a.row - b.row || REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason),
  );

/**
 * Checks the read rows (AC-31) and works out what the import would create (AC-30). AC-20 — the
 * employee-record rules — is `org`'s and checked by the application on `plan.resources`.
 */
export const checkImport = (read: ReadImport, reference: ImportReference): ImportCheck => {
  const problems: ImportProblemRow[] = [...read.problems];
  const resources = collectResources(read.rows, problems);
  const byName = new Map(resources.map((r) => [r.fullName, r]));
  const projects = collectProjects(read.rows, reference.openProjects, problems);

  const allocations: ImportAllocation[] = [];
  for (const row of read.rows) {
    const resource = byName.get(row.employee) as ImportResource;
    const key = projectKey(row.project);
    const project = projects.get(key) as ImportProject;
    const checked = allocationProblems(row, resource, project);
    problems.push(...checked.problems);
    if (checked.segment !== null) {
      allocations.push({
        row: row.row,
        employee: row.employee,
        projectKey: key,
        segment: checked.segment,
      });
    }
  }
  problems.push(...similarNameProblems(read.rows, reference));

  const plan: ImportPlan = {
    resources,
    projects: [...projects.values()].map(({ typeRow: _, ...project }) => project),
    allocations,
  };
  return {
    problems: sortProblems(problems),
    plan,
    overbookedWeeks:
      problems.length === 0 ? importOverbooking(resources, allocations, reference.holidays) : [],
  };
};

/** The first and last day the rows' dates touch, widened to whole ISO weeks; `None` without dates. */
export const importWindow = (
  rows: ReadonlyArray<ImportRow>,
): Option.Option<{ readonly from: IsoDate; readonly to: IsoDate }> => {
  const dates = rows
    .flatMap((row) => [row.startsOn, row.endsOn])
    .filter((d): d is IsoDate => d !== null);
  if (dates.length === 0) return Option.none();
  dates.sort();
  return Option.some({
    from: isoWeekStart(dates[0] as IsoDate),
    to: addDays(isoWeekStart(dates[dates.length - 1] as IsoDate), 6),
  });
};
