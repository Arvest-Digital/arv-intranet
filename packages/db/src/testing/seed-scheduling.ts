import { sql } from 'drizzle-orm';
import type { Executor } from '../database';

// Seeds the scheduling schema with raw SQL (data-model.md §Test fixtures): @arv/db sits below the
// modules and can't import their tables. Mirrors `modules/scheduling/src/domain/allocation.ts`.
// employee_id / project_id / *_by are plain UUIDs (no cross-schema FK): any UUID will do.

export type SegmentSeed = {
  /** `YYYY-MM-DD`, inclusive. */
  startsOn: string;
  /** `YYYY-MM-DD`, inclusive. */
  endsOn: string;
  /** Minutes per day / week; `null` only for `full-day` (leave). */
  rateMinutes: number | null;
  ratePeriod: 'day' | 'week' | 'full-day';
};

// ---------------------------------------------------------------------------------------------
// scheduling.allocations + scheduling.allocation_segments

export type AllocationSeed = {
  id?: string;
  employeeId: string;
  projectId: string;
  /** In order, contiguous, never empty (the domain's invariant; not checked here). */
  segments: ReadonlyArray<SegmentSeed>;
  version: number;
  lastChangedBy: string;
  lastChangedAt?: Date;
  createdAt?: Date;
};
export type SeededAllocation = Omit<Required<AllocationSeed>, 'segments'> & {
  segments: SegmentSeed[];
};

/** Version 1; pass the employee, project, segments and who changed it last. */
export function makeAllocation(
  overrides: Partial<AllocationSeed> &
    Pick<AllocationSeed, 'employeeId' | 'projectId' | 'segments' | 'lastChangedBy'>,
): AllocationSeed {
  return { version: 1, ...overrides };
}

/** Inserts the allocations and their segments; returns them in input order. */
export async function seedAllocations(db: Executor, rows: ReadonlyArray<AllocationSeed>) {
  const seeded: SeededAllocation[] = [];
  // One allocation at a time: few rows per test, and the segments need the generated id.
  for (const row of rows) {
    const {
      rows: [allocation],
    } = await db.execute<Omit<SeededAllocation, 'segments'>>(sql`
      INSERT INTO scheduling.allocations (
        id, employee_id, project_id, version, last_changed_by, last_changed_at, created_at
      ) VALUES (
        coalesce(${row.id ?? null}::uuid, uuidv7()),
        ${row.employeeId}::uuid,
        ${row.projectId}::uuid,
        ${row.version}::integer,
        ${row.lastChangedBy}::uuid,
        coalesce(${row.lastChangedAt?.toISOString() ?? null}::timestamptz, now()),
        coalesce(${row.createdAt?.toISOString() ?? null}::timestamptz, now())
      )
      RETURNING id, employee_id AS "employeeId", project_id AS "projectId", version,
        last_changed_by AS "lastChangedBy", last_changed_at AS "lastChangedAt",
        created_at AS "createdAt"
    `);
    if (allocation === undefined) throw new Error('allocation INSERT returned no row');
    if (row.segments.length > 0) {
      const values = sql.join(
        row.segments.map(
          (s) => sql`(
            ${allocation.id}::uuid,
            ${s.startsOn}::date,
            ${s.endsOn}::date,
            ${s.rateMinutes}::integer,
            ${s.ratePeriod}
          )`,
        ),
        sql`, `,
      );
      await db.execute(sql`
        INSERT INTO scheduling.allocation_segments
          (allocation_id, starts_on, ends_on, rate_minutes, rate_period)
        VALUES ${values}
      `);
    }
    seeded.push({
      ...allocation,
      // drizzle's pg driver hands raw `execute` timestamps back as strings.
      lastChangedAt: new Date(allocation.lastChangedAt),
      createdAt: new Date(allocation.createdAt),
      segments: row.segments.map((s) => ({ ...s })),
    });
  }
  return seeded;
}

// ---------------------------------------------------------------------------------------------
// scheduling.allocation_history

export type HistoryEntrySeed = {
  id?: string;
  /** No FK: may name an allocation that was removed (AC-07a). */
  allocationId: string;
  employeeId: string;
  projectId: string;
  changeKind: 'created' | 'imported' | 'changed' | 'trimmed' | 'removed';
  effectiveFrom: string | null;
  beforeValues: ReadonlyArray<SegmentSeed> | null;
  afterValues: ReadonlyArray<SegmentSeed> | null;
  changedBy: string;
  /** Back-date it to test the 12-month window and the purge (AC-16). */
  createdAt?: Date;
};
export type SeededHistoryEntry = Required<Omit<HistoryEntrySeed, 'beforeValues' | 'afterValues'>>;

/** A `created` entry with no before / after values; pass the ids and who made it. */
export function makeHistoryEntry(
  overrides: Partial<HistoryEntrySeed> &
    Pick<HistoryEntrySeed, 'allocationId' | 'employeeId' | 'projectId' | 'changedBy'>,
): HistoryEntrySeed {
  return {
    changeKind: 'created',
    effectiveFrom: null,
    beforeValues: null,
    afterValues: null,
    ...overrides,
  };
}

const json = (value: ReadonlyArray<SegmentSeed> | null) =>
  value === null ? null : JSON.stringify(value);

export async function seedAllocationHistory(db: Executor, rows: ReadonlyArray<HistoryEntrySeed>) {
  if (rows.length === 0) return [];
  const values = sql.join(
    rows.map(
      (row, ordinal) => sql`(
        ${ordinal}::int,
        coalesce(${row.id ?? null}::uuid, uuidv7()),
        ${row.allocationId}::uuid,
        ${row.employeeId}::uuid,
        ${row.projectId}::uuid,
        ${row.changeKind},
        ${row.effectiveFrom}::date,
        ${json(row.beforeValues)}::jsonb,
        ${json(row.afterValues)}::jsonb,
        ${row.changedBy}::uuid,
        coalesce(${row.createdAt?.toISOString() ?? null}::timestamptz, now())
      )`,
    ),
    sql`, `,
  );
  // INSERT … RETURNING has no guaranteed order, so the input ordinal sorts the result.
  const { rows: seeded } = await db.execute<
    Omit<SeededHistoryEntry, 'createdAt'> & { createdAt: string }
  >(sql`
    WITH input (ordinal, id, allocation_id, employee_id, project_id, change_kind, effective_from,
      before_values, after_values, changed_by, created_at) AS (VALUES ${values}),
    inserted AS (
      INSERT INTO scheduling.allocation_history (id, allocation_id, employee_id, project_id,
        change_kind, effective_from, before_values, after_values, changed_by, created_at)
      SELECT id, allocation_id, employee_id, project_id, change_kind, effective_from,
        before_values, after_values, changed_by, created_at
      FROM input ORDER BY ordinal
      RETURNING id, allocation_id AS "allocationId", employee_id AS "employeeId",
        project_id AS "projectId", change_kind AS "changeKind",
        effective_from::text AS "effectiveFrom", changed_by AS "changedBy",
        created_at AS "createdAt"
    )
    SELECT inserted.* FROM inserted JOIN input USING (id) ORDER BY input.ordinal
  `);
  return seeded.map((row): SeededHistoryEntry => ({ ...row, createdAt: new Date(row.createdAt) }));
}
