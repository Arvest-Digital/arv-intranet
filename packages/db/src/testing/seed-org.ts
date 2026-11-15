import { sql } from 'drizzle-orm';
import type { Executor } from '../database';

// Seeds the org schema with raw SQL: @arv/db sits below the modules and can't import their tables.
// PII guard: defaults use `Team <n>`, `Test User <n>` and `Test holiday`, never real names.
// Shapes follow data-model §Test fixtures.

let counter = 0;
const next = () => {
  counter += 1;
  return counter;
};

// ---------------------------------------------------------------------------------------------
// org.teams

export type TeamSeed = { id?: string; name: string; teamLeadId: string | null; createdAt?: Date };
export type SeededTeam = { id: string; name: string; teamLeadId: string | null; createdAt: Date };

/** A team named `Team <n>` without a lead; set `teamLeadId` once its record exists. */
export function makeTeam(overrides: Partial<TeamSeed> = {}): TeamSeed {
  return { name: `Team ${next()}`, teamLeadId: null, ...overrides };
}

export async function seedTeams(db: Executor, rows: ReadonlyArray<TeamSeed>) {
  if (rows.length === 0) return [];
  const values = sql.join(
    rows.map(
      (row) => sql`(
        coalesce(${row.id ?? null}::uuid, uuidv7()),
        ${row.name},
        ${row.teamLeadId}::uuid,
        coalesce(${row.createdAt?.toISOString() ?? null}::timestamptz, now())
      )`,
    ),
    sql`, `,
  );
  const { rows: seeded } = await db.execute<SeededTeam>(sql`
    INSERT INTO org.teams (id, name, team_lead_id, created_at) VALUES ${values}
    RETURNING id, name, team_lead_id AS "teamLeadId", created_at AS "createdAt"
  `);
  return seeded;
}

// ---------------------------------------------------------------------------------------------
// org.employee_records

export type EmployeeRecordSeed = {
  id?: string;
  fullName: string;
  userId: string | null;
  teamId: string | null;
  /** `null` for an incomplete record (AC-06). */
  contractMinutes: number | null;
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  workingDays: ReadonlyArray<number>;
  /** `YYYY-MM-DD`; `null` for an incomplete record (AC-06). */
  employmentStart: string | null;
  employmentEnd: string | null;
  version: number;
  /** The identity user id stamped as «last changed by»; no FK, any UUID will do. */
  lastChangedBy: string;
  lastChangedAt?: Date;
  createdAt?: Date;
};
export type SeededEmployeeRecord = Required<Omit<EmployeeRecordSeed, 'workingDays'>> & {
  workingDays: number[];
};

/** A full-time record (40 h, Monday–Friday) named `Test User <n>`, started 2026-01-05. */
export function makeEmployeeRecord(
  overrides: Partial<EmployeeRecordSeed> & Pick<EmployeeRecordSeed, 'lastChangedBy'>,
): EmployeeRecordSeed {
  return {
    fullName: `Test User ${next()}`,
    userId: null,
    teamId: null,
    contractMinutes: 2400,
    workingDays: [1, 2, 3, 4, 5],
    employmentStart: '2026-01-05',
    employmentEnd: null,
    version: 1,
    ...overrides,
  };
}

export async function seedEmployeeRecords(db: Executor, rows: ReadonlyArray<EmployeeRecordSeed>) {
  if (rows.length === 0) return [];
  const values = sql.join(
    rows.map(
      (row) => sql`(
        coalesce(${row.id ?? null}::uuid, uuidv7()),
        ${row.fullName},
        ${row.userId}::uuid,
        ${row.teamId}::uuid,
        ${row.contractMinutes}::integer,
        ${`{${row.workingDays.join(',')}}`}::smallint[],
        ${row.employmentStart}::date,
        ${row.employmentEnd}::date,
        ${row.version}::integer,
        ${row.lastChangedBy}::uuid,
        coalesce(${row.lastChangedAt?.toISOString() ?? null}::timestamptz, now()),
        coalesce(${row.createdAt?.toISOString() ?? null}::timestamptz, now())
      )`,
    ),
    sql`, `,
  );
  const { rows: seeded } = await db.execute<SeededEmployeeRecord>(sql`
    INSERT INTO org.employee_records (
      id, full_name, user_id, team_id, contract_minutes, working_days, employment_start,
      employment_end, version, last_changed_by, last_changed_at, created_at
    ) VALUES ${values}
    RETURNING id, full_name AS "fullName", user_id AS "userId", team_id AS "teamId",
      contract_minutes AS "contractMinutes", working_days AS "workingDays",
      employment_start::text AS "employmentStart", employment_end::text AS "employmentEnd",
      version, last_changed_by AS "lastChangedBy", last_changed_at AS "lastChangedAt",
      created_at AS "createdAt"
  `);
  return seeded;
}

// ---------------------------------------------------------------------------------------------
// org.public_holidays

export type PublicHolidaySeed = {
  id?: string;
  /** `YYYY-MM-DD`; one holiday per date. */
  holidayDate: string;
  name: string;
  createdAt?: Date;
};
export type SeededPublicHoliday = Required<PublicHolidaySeed>;

export function makePublicHoliday(
  overrides: Partial<PublicHolidaySeed> & Pick<PublicHolidaySeed, 'holidayDate'>,
): PublicHolidaySeed {
  return { name: 'Test holiday', ...overrides };
}

export async function seedPublicHolidays(db: Executor, rows: ReadonlyArray<PublicHolidaySeed>) {
  if (rows.length === 0) return [];
  const values = sql.join(
    rows.map(
      (row) => sql`(
        coalesce(${row.id ?? null}::uuid, uuidv7()),
        ${row.holidayDate}::date,
        ${row.name},
        coalesce(${row.createdAt?.toISOString() ?? null}::timestamptz, now())
      )`,
    ),
    sql`, `,
  );
  const { rows: seeded } = await db.execute<SeededPublicHoliday>(sql`
    INSERT INTO org.public_holidays (id, holiday_date, name, created_at) VALUES ${values}
    RETURNING id, holiday_date::text AS "holidayDate", name, created_at AS "createdAt"
  `);
  return seeded;
}
